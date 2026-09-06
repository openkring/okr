import { describe, it, expect, beforeEach } from 'vitest';
import { AVATAR_INFO_SHAPE, AvatarInfo, GroupModel, UserModel } from '@okr/shared-models';
import { canAccessGroup, findConflictingGroups, findDuplicateGroups, findGroupKeyIssues, getGroupKeyFromName, getMainContact, getUniqueGroupKey, getVisibilityRoles, getVisibleGroupKeys, shouldNotifyUser, userMatchesGroupVisibility, withCreatorAsAdmin } from './group.util';

describe('Group Utils', () => {
  const tenantId = 'tenant-1';
  let group: GroupModel;

  beforeEach(() => {
    group = new GroupModel(tenantId);
    group.okey = 'group-key-1';
    group.name = 'Test Group';
    group.tags = 'test,group';
    group.notes = 'Some notes about the group.';
    group.hasContent = false;
    group.hasChat = false;
    group.parentKey = 'parent-key-1';
    group.parentName = 'Parent Org';
    group.parentModelType = 'org';
  });

  describe('GroupFormModel functions', () => {
    it('newGroupFormModel should return a default form model', () => {
      const formModel = new GroupModel('tenant-1');
      expect(formModel.name).toBe('');
      expect(formModel.hasChat).toBe(true);
      expect(formModel.parentModelType).toBe('org');
    });
  });
});

// ─── key derivation ─────────────────────────────────────────────────────────────

describe('getGroupKeyFromName', () => {
  it('lower-cases, strips blanks/special chars and prefixes the tenant', () => {
    expect(getGroupKeyFromName('Vorstand 2026!', 'scs')).toBe('scs_vorstand2026');
  });

  it('de-accents umlauts and diacritics', () => {
    expect(getGroupKeyFromName('Wädenswil Café', 'scs')).toBe('scs_wadenswilcafe');
  });

  it('truncates the name part to 15 chars by default', () => {
    expect(getGroupKeyFromName('Ressort Kommunikation und Marketing', 'scs')).toBe('scs_ressortkommunik');
  });

  it('respects a custom maxLength', () => {
    expect(getGroupKeyFromName('Vorstand', 'scs', 4)).toBe('scs_vors');
  });

  it('keeps the same name apart across tenants', () => {
    expect(getGroupKeyFromName('Notfall', 'scs')).not.toBe(getGroupKeyFromName('Notfall', 'p13'));
  });

  it('returns empty string when nothing usable remains', () => {
    expect(getGroupKeyFromName('   ', 'scs')).toBe('');
    expect(getGroupKeyFromName('🚣', 'scs')).toBe('');
    expect(getGroupKeyFromName(undefined, 'scs')).toBe('');
  });
});

describe('getUniqueGroupKey', () => {
  it('returns the base key when it is free', () => {
    expect(getUniqueGroupKey('Vorstand', 'scs', new Set())).toBe('scs_vorstand');
  });

  it('appends a numeric suffix on collision', () => {
    expect(getUniqueGroupKey('Vorstand', 'scs', new Set(['scs_vorstand']))).toBe('scs_vorstand2');
    expect(getUniqueGroupKey('Vorstand', 'scs', new Set(['scs_vorstand', 'scs_vorstand2']))).toBe('scs_vorstand3');
  });

  it('treats groups and orgs as one shared key namespace', () => {
    // 'scs_vorstand' taken by an org → the new group must not reuse it
    expect(getUniqueGroupKey('Vorstand', 'scs', ['scs_vorstand'])).toBe('scs_vorstand2');
  });

  it('does not collide with the same group name in another tenant', () => {
    // the other tenant's 'Notfall' key is taken, but it cannot shadow this tenant's
    expect(getUniqueGroupKey('Notfall', 'p13', new Set(['scs_notfall']))).toBe('p13_notfall');
  });

  it('returns empty string when the name normalizes to nothing', () => {
    expect(getUniqueGroupKey('🚣', 'scs', new Set())).toBe('');
  });
});

// ─── visibility helpers ────────────────────────────────────────────────────────

function makeGroup(visibility: string, notifyType: 'memberOnly' | 'membersAndMatchingVisibility' = 'memberOnly'): GroupModel {
  const g = new GroupModel('t1');
  g.okey = 'g1';
  g.visibility = visibility;
  g.notifyType = notifyType;
  return g;
}

function makeUser(roles: Partial<{ registered: boolean; privileged: boolean; admin: boolean }>): UserModel {
  const u = new UserModel('t1');
  u.roles = { registered: false, privileged: false, admin: false, ...roles };
  return u;
}

describe('getVisibilityRoles', () => {
  it('returns empty array when visibility is empty', () => {
    expect(getVisibilityRoles(makeGroup(''))).toEqual([]);
  });

  it('returns single role', () => {
    expect(getVisibilityRoles(makeGroup('registered'))).toEqual(['registered']);
  });

  it('returns multiple roles and trims whitespace', () => {
    expect(getVisibilityRoles(makeGroup(' registered , privileged '))).toEqual(['registered', 'privileged']);
  });
});

describe('userMatchesGroupVisibility', () => {
  it('returns false when visibility is empty', () => {
    expect(userMatchesGroupVisibility(makeGroup(''), makeUser({ registered: true }))).toBe(false);
  });

  it('returns true when user has a matching role', () => {
    expect(userMatchesGroupVisibility(makeGroup('registered'), makeUser({ registered: true }))).toBe(true);
  });

  it('returns false when user has no matching role', () => {
    expect(userMatchesGroupVisibility(makeGroup('privileged'), makeUser({ registered: true, privileged: false }))).toBe(false);
  });

  it('returns true when any one of multiple roles matches', () => {
    expect(userMatchesGroupVisibility(makeGroup('privileged,registered'), makeUser({ registered: true }))).toBe(true);
  });
});

describe('getVisibleGroupKeys', () => {
  it('returns groups visible via role, excluding member groups', () => {
    const g1 = makeGroup('registered'); g1.okey = 'g1';
    const g2 = makeGroup('registered'); g2.okey = 'g2';
    const g3 = makeGroup(''); g3.okey = 'g3';
    const user = makeUser({ registered: true });
    // g1 is already a member group → excluded; g2 visible; g3 empty visibility → excluded
    const result = getVisibleGroupKeys([g1, g2, g3], new Set(['g1']), user);
    expect(result).toEqual(['g2']);
  });

  it('returns empty array when no groups match', () => {
    const g1 = makeGroup('privileged'); g1.okey = 'g1';
    const user = makeUser({ registered: true, privileged: false });
    expect(getVisibleGroupKeys([g1], new Set(), user)).toEqual([]);
  });
});

describe('canAccessGroup', () => {
  it('returns true when user is a member', () => {
    expect(canAccessGroup(makeGroup(''), true, makeUser({}))).toBe(true);
  });

  it('returns true when user matches visibility role', () => {
    expect(canAccessGroup(makeGroup('registered'), false, makeUser({ registered: true }))).toBe(true);
  });

  it('returns false when not a member and no matching role', () => {
    expect(canAccessGroup(makeGroup('privileged'), false, makeUser({ registered: true, privileged: false }))).toBe(false);
  });
});

describe('shouldNotifyUser', () => {
  it('always notifies a member regardless of notifyType', () => {
    expect(shouldNotifyUser(makeGroup('', 'memberOnly'), true, makeUser({}))).toBe(true);
    expect(shouldNotifyUser(makeGroup('registered', 'membersAndMatchingVisibility'), true, makeUser({}))).toBe(true);
  });

  it('does not notify non-member when notifyType is memberOnly', () => {
    expect(shouldNotifyUser(makeGroup('registered', 'memberOnly'), false, makeUser({ registered: true }))).toBe(false);
  });

  it('notifies non-member when notifyType is membersAndMatchingVisibility and role matches', () => {
    expect(shouldNotifyUser(makeGroup('registered', 'membersAndMatchingVisibility'), false, makeUser({ registered: true }))).toBe(true);
  });

  it('does not notify non-member when notifyType is membersAndMatchingVisibility but role does not match', () => {
    expect(shouldNotifyUser(makeGroup('privileged', 'membersAndMatchingVisibility'), false, makeUser({ registered: true, privileged: false }))).toBe(false);
  });
});

describe('Group creator safety net', () => {
  const tenantId = 'scs';
  const creator: AvatarInfo = { ...AVATAR_INFO_SHAPE, key: 'kaiser', name1: 'Bruno', name2: 'Kaiser', modelType: 'person' };
  const other: AvatarInfo = { ...AVATAR_INFO_SHAPE, key: 'reto', name1: 'Reto', name2: 'Ammann', modelType: 'person' };

  it('appends the creator when a privileged user nominated somebody else', () => {
    const admins = withCreatorAsAdmin([other], creator);
    expect(admins.map(a => a.key)).toEqual(['reto', 'kaiser']);
  });

  it('keeps the nominated person as main contact (admins[0])', () => {
    expect(getMainContact({ ...new GroupModel(tenantId), admins: withCreatorAsAdmin([other], creator) })?.key).toBe('reto');
  });

  it('does not duplicate a creator who is already an admin', () => {
    expect(withCreatorAsAdmin([creator, other], creator).map(a => a.key)).toEqual(['kaiser', 'reto']);
  });

  it('leaves the list untouched without a creator', () => {
    expect(withCreatorAsAdmin([other], undefined).map(a => a.key)).toEqual(['reto']);
  });

  it('makes the creator the only admin when the form left the list empty', () => {
    expect(withCreatorAsAdmin([], creator).map(a => a.key)).toEqual(['kaiser']);
  });
});

describe('Group duplicate detection', () => {
  const tenantId = 'scs';

  function makeG(okey: string, name: string, overrides: Partial<GroupModel> = {}): GroupModel {
    return Object.assign(new GroupModel(tenantId), { okey, name }, overrides);
  }

  it('reports two live groups whose names collide once normalised', () => {
    const found = findDuplicateGroups([makeG('scs_vierer', 'SCS Vierer'), makeG('scsvierer', 'scs-vierer')]);
    expect(found).toHaveLength(1);
    expect(found[0].groups.map(g => g.okey)).toEqual(['scs_vierer', 'scsvierer']);
  });

  it('ignores archived groups and ad-hoc chat documents', () => {
    const groups = [
      makeG('a', 'Vorstand'),
      makeG('b', 'Vorstand', { isArchived: true }),
      makeG('c', 'Vorstand', { kind: 'chat' }),
    ];
    expect(findDuplicateGroups(groups)).toEqual([]);
  });

  it('findConflictingGroups guards the create path', () => {
    const existing = [makeG('Dienstags 4-er', '4X-Dienstag')];
    expect(findConflictingGroups('4X Dienstag', existing).map(g => g.okey)).toEqual(['Dienstags 4-er']);
    expect(findConflictingGroups('Freitags 8-er', existing)).toEqual([]);
  });
});

describe('Group key hygiene', () => {
  const tenantId = 'scs';

  function makeG(okey: string, name: string, overrides: Partial<GroupModel> = {}): GroupModel {
    return Object.assign(new GroupModel(tenantId), { okey, name }, overrides);
  }

  it('flags a legacy key with a blank in it', () => {
    const issues = findGroupKeyIssues([makeG('Dienstags 4-er', '4X-Dienstag')], tenantId);
    expect(issues.map(i => i.kind)).toEqual(['unsafeCharacters']);
    expect(issues[0].aliasLocalpart).toBe('group_dienstags_4-er');
  });

  it('flags an umlaut key', () => {
    expect(findGroupKeyIssues([makeG('Zürcher Sportfest 2026', 'Zürcher Sportfest 2026')], tenantId)
      .some(i => i.kind === 'unsafeCharacters')).toBe(true);
  });

  it('accepts a key produced by getGroupKeyFromName', () => {
    const okey = getGroupKeyFromName('Gipfelischiff', tenantId);
    expect(findGroupKeyIssues([makeG(okey, 'Gipfelischiff')], tenantId)).toEqual([]);
  });

  it('exempts the seeded role groups and the tenant\'s own key from the prefix rule', () => {
    expect(findGroupKeyIssues([makeG('treasurer', 'Finanzen')], tenantId)).toEqual([]);
    expect(findGroupKeyIssues([makeG('scs', 'Ganzer Verein')], tenantId)).toEqual([]);
  });

  it('reports an unprefixed key that provisioning did not seed', () => {
    expect(findGroupKeyIssues([makeG('Redaktion', 'Redaktion')], tenantId).map(i => i.kind)).toEqual(['missingTenantPrefix']);
    expect(findGroupKeyIssues([makeG('Redaktion', 'Redaktion')], tenantId, ['Redaktion'])).toEqual([]);
  });

  it('detects two keys collapsing onto one Matrix alias', () => {
    const issues = findGroupKeyIssues([makeG('Dienstags 4-er', 'A'), makeG('dienstags_4-er', 'B')], tenantId);
    const collisions = issues.filter(i => i.kind === 'aliasCollision');
    expect(collisions).toHaveLength(2);
    expect(collisions[0].collidesWith).toEqual(['dienstags_4-er']);
  });
});

import { describe, expect, it } from 'vitest';

import { GroupModel } from '@okr/shared-models';

import { groupDriftFindings, GroupDriftTexts, GroupRoomDrift, groupHygieneFindings, GroupHygieneTexts } from './group-report.util';

const TEXTS: GroupHygieneTexts = {
  duplicate: '{count} Gruppen: {groups}',
  aliasCollision: 'Alias {alias} auch bei {others}',
  unsafeCharacters: 'Unsicher, hiesse {tenantId}_...',
  missingTenantPrefix: 'Kein Praefix {tenantId}_',
};

function makeGroup(okey: string, name: string, overrides: Partial<GroupModel> = {}): GroupModel {
  const group = new GroupModel('scs');
  group.okey = okey;
  group.name = name;
  return Object.assign(group, overrides);
}

describe('groupHygieneFindings', () => {
  it('returns [] for no groups', () => {
    expect(groupHygieneFindings([], 'scs', TEXTS)).toEqual([]);
  });

  it('returns [] for healthy groups', () => {
    expect(groupHygieneFindings([makeGroup('scs_a', 'Alpha'), makeGroup('scs_b', 'Beta')], 'scs', TEXTS)).toEqual([]);
  });

  it('reports two groups with the same name as one finding keyed by both okeys', () => {
    const findings = groupHygieneFindings([makeGroup('scs_v2', 'Vorstand'), makeGroup('scs_v1', 'vorstand')], 'scs', TEXTS);
    expect(findings).toEqual([{
      id: 'scs_v1/scs_v2',
      title: 'vorstand',
      detail: '2 Gruppen: vorstand (scs_v1), Vorstand (scs_v2)',
      url: '/group-view/scs_v1',
    }]);
  });

  it('reports a missing tenant prefix with the group detail url', () => {
    const findings = groupHygieneFindings([makeGroup('ruderer', 'Ruderer')], 'scs', TEXTS);
    expect(findings).toEqual([{
      id: 'ruderer', title: 'Ruderer', detail: 'Kein Praefix scs_', url: '/group-view/ruderer',
    }]);
  });

  it('does not report a seeded unprefixed key', () => {
    expect(groupHygieneFindings([makeGroup('vorstand', 'Vorstandsgruppe')], 'scs', TEXTS)).toEqual([]);
  });

  it('reports unsafe characters', () => {
    const findings = groupHygieneFindings([makeGroup('scs_Zürich', 'Zürich')], 'scs', TEXTS);
    expect(findings).toEqual([{
      id: 'scs_Zürich', title: 'Zürich', detail: 'Unsicher, hiesse scs_...', url: '/group-view/scs_Z%C3%BCrich',
    }]);
  });

  it('reports an alias collision for both groups', () => {
    const findings = groupHygieneFindings([makeGroup('scs_Ab', 'Eins'), makeGroup('scs_ab', 'Zwei')], 'scs', TEXTS);
    expect(findings.map(f => f.id)).toEqual(['scs_Ab', 'scs_ab']);
    expect(findings[0].detail).toBe('Alias group_scs_ab auch bei scs_ab');
    expect(findings[1].detail).toBe('Alias group_scs_ab auch bei scs_Ab');
  });
});

const DRIFT_TEXTS: GroupDriftTexts = {
  extras: '{count} ohne Mitgliedschaft: {names}',
  missing: '{count} Mitglieder fehlen im Raum',
  prune: 'Entfernen',
};

function makeDrift(overrides: Partial<GroupRoomDrift> = {}): GroupRoomDrift {
  return {
    groupKey: 'scs_a', groupName: 'Alpha', roomId: '!r:x', memberCount: 5, roomMemberCount: 6,
    missing: [], extras: [], ...overrides,
  };
}

describe('groupDriftFindings', () => {
  it('returns [] for no drift', () => {
    expect(groupDriftFindings([], DRIFT_TEXTS)).toEqual([]);
  });

  it('gives a drift with extras a danger prune action and lists the names', () => {
    const findings = groupDriftFindings([makeDrift({
      extras: [{ userId: '@a:x', displayName: 'Anna' }, { userId: '@b:x', displayName: '' }],
    })], DRIFT_TEXTS);
    expect(findings).toEqual([{
      id: 'scs_a',
      title: 'Alpha',
      detail: '2 ohne Mitgliedschaft: Anna, @b:x',
      url: '/group-view/scs_a',
      actions: [{ id: 'prune', label: 'Entfernen', danger: true }],
    }]);
  });

  it('gives a missing-only drift no action', () => {
    const findings = groupDriftFindings([makeDrift({ missing: ['p1', 'p2', 'p3'] })], DRIFT_TEXTS);
    expect(findings).toEqual([{
      id: 'scs_a',
      title: 'Alpha',
      detail: '3 Mitglieder fehlen im Raum',
      url: '/group-view/scs_a',
      actions: undefined,
    }]);
  });

  it('joins extras and missing in one detail', () => {
    const [finding] = groupDriftFindings([makeDrift({
      missing: ['p1'], extras: [{ userId: '@a:x', displayName: 'Anna' }],
    })], DRIFT_TEXTS);
    expect(finding.detail).toBe('1 ohne Mitgliedschaft: Anna · 1 Mitglieder fehlen im Raum');
  });
});

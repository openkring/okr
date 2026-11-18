import { describe, expect, it } from 'vitest';

import { AVATAR_CONFIG_SHAPE, AvatarConfig, AvatarInfo, NameDisplay } from '@okr/shared-models';

import {
  getPeopleAltText, getPeopleBgColor, getPeopleImgixParams, getPeopleExcludedKeys, getPeopleImgRadius, getPeopleResponsibilityIds, getPeopleResponsibilityParentKey, getResponsibilityKeysUnderParent, mergeResponsibilityKeys, normalizeAvatarConfig, splitIntoRows, toHexColor
} from './people-section.util';

const config = (patch: Partial<AvatarConfig> = {}): AvatarConfig => ({ ...AVATAR_CONFIG_SHAPE, ...patch });

describe('normalizeAvatarConfig', () => {
  it('returns the defaults for a missing config', () => {
    expect(normalizeAvatarConfig(undefined)).toEqual(AVATAR_CONFIG_SHAPE);
  });

  it('keeps stored values and fills the missing ones', () => {
    const result = normalizeAvatarConfig({ title: 'Vorstand', view: 'grid' } as Partial<AvatarConfig>);
    expect(result.title).toBe('Vorstand');
    expect(result.view).toBe('grid');
    expect(result.imgWidth).toBe(AVATAR_CONFIG_SHAPE.imgWidth);
  });

  it('does not let undefined or null overwrite a default', () => {
    const result = normalizeAvatarConfig({ imgWidth: undefined, imgHeight: null } as unknown as Partial<AvatarConfig>);
    expect(result.imgWidth).toBe(AVATAR_CONFIG_SHAPE.imgWidth);
    expect(result.imgHeight).toBe(AVATAR_CONFIG_SHAPE.imgHeight);
  });

  it('maps the retired showName=false to nameDisplay None', () => {
    expect(normalizeAvatarConfig({ showName: false } as Partial<AvatarConfig>).nameDisplay).toBe(NameDisplay.None);
  });

  it('keeps an explicit nameDisplay over the retired showName', () => {
    expect(normalizeAvatarConfig({ showName: false, nameDisplay: NameDisplay.LastFirst } as Partial<AvatarConfig>).nameDisplay)
      .toBe(NameDisplay.LastFirst);
  });

  it('maps the retired showLabel to info function on a legacy config', () => {
    expect(normalizeAvatarConfig({ showLabel: true } as Partial<AvatarConfig>).info).toEqual(['function']);
    expect(normalizeAvatarConfig({ showLabel: false } as Partial<AvatarConfig>).info).toEqual([]);
  });

  it('keeps a stored info list', () => {
    expect(normalizeAvatarConfig({ showLabel: true, info: ['email'] } as Partial<AvatarConfig>).info).toEqual(['email']);
  });
});

describe('getPeopleAltText', () => {
  it('replaces every @NAME@ with the full name', () => {
    expect(getPeopleAltText('Avatar von @NAME@ (@NAME@)', 'Anna Muster')).toBe('Avatar von Anna Muster (Anna Muster)');
  });

  it('falls back to the default text when empty', () => {
    expect(getPeopleAltText('  ', 'Anna Muster')).toBe('Avatar von Anna Muster');
  });

  it('keeps a text without placeholder', () => {
    expect(getPeopleAltText('Vorstandsfoto', 'Anna Muster')).toBe('Vorstandsfoto');
  });
});

describe('getPeopleImgRadius', () => {
  it('reads a bare number as px', () => {
    expect(getPeopleImgRadius('8')).toBe('8px');
  });
  it('keeps px and percent values', () => {
    expect(getPeopleImgRadius('12px')).toBe('12px');
    expect(getPeopleImgRadius('50%')).toBe('50%');
  });
  it('falls back to the default for garbage', () => {
    expect(getPeopleImgRadius('round')).toBe(AVATAR_CONFIG_SHAPE.imgRadius);
    expect(getPeopleImgRadius(undefined)).toBe(AVATAR_CONFIG_SHAPE.imgRadius);
  });
});

describe('getPeopleBgColor', () => {
  it('is undefined for the original photo and the plain cut-out', () => {
    expect(getPeopleBgColor(config({ background: 'original' }), 0, '#112233')).toBeUndefined();
    expect(getPeopleBgColor(config({ background: 'removed' }), 0, '#112233')).toBeUndefined();
  });
  it('uses the org colour', () => {
    expect(getPeopleBgColor(config({ background: 'orgColor' }), 3, '#112233')).toBe('#112233');
  });
  it('alternates primary and secondary org colour', () => {
    const c = config({ background: 'orgColor', bgOrgColor: 'alternating' });
    expect([0, 1, 2].map(i => getPeopleBgColor(c, i, ['#111111', '#222222']))).toEqual(['#111111', '#222222', '#111111']);
  });
  it('cycles the own colours over the persons and skips invalid ones', () => {
    const c = config({ background: 'colors', bgColors: ['#ff0000', 'nope', '#00ff00'] });
    expect([0, 1, 2].map(i => getPeopleBgColor(c, i))).toEqual(['#ff0000', '#00ff00', '#ff0000']);
  });
});

describe('getPeopleImgixParams', () => {
  it('crops on faces by default', () => {
    expect(getPeopleImgixParams(config({ imgWidth: 100, imgHeight: 80 })))
      .toBe('w=100&h=80&dpr=2&auto=format,compress&fit=crop&crop=faces');
  });
  it('uses facearea with a facepad', () => {
    expect(getPeopleImgixParams(config({ facePad: 1.5 }))).toContain('fit=facearea&facepad=1.5');
  });
  it('adds background removal and the fill colour', () => {
    const params = getPeopleImgixParams(config({ background: 'colors' }), '#a1b2c3');
    expect(params).not.toContain('sat=-100');
    expect(params).toContain('bg-remove=true');
    expect(params).toContain('bg=A1B2C3');
  });
  it('greys only the person on a cut-out: no imgix fill, so the colour stays', () => {
    const params = getPeopleImgixParams(config({ grayscale: true, background: 'colors' }), '#a1b2c3');
    expect(params).toContain('sat=-100');
    expect(params).toContain('bg-remove=true');
    expect(params).not.toContain('bg=');
  });
  it('greys the whole original photo', () => {
    expect(getPeopleImgixParams(config({ grayscale: true, background: 'original' }))).toContain('sat=-100');
  });
  it('never removes the background of an original photo', () => {
    expect(getPeopleImgixParams(config({ background: 'original' }), '#a1b2c3')).not.toContain('bg');
  });
});

describe('getPeopleResponsibilityIds', () => {
  it('reads the list', () => {
    expect(getPeopleResponsibilityIds({ responsibilityIds: ['a', '', 'b'] })).toEqual(['a', 'b']);
  });
  it('reads a legacy single responsibility as a list of one', () => {
    expect(getPeopleResponsibilityIds({ responsibilityId: 'x' })).toEqual(['x']);
  });
  it('prefers the list over the legacy key and is empty without both', () => {
    expect(getPeopleResponsibilityIds({ responsibilityIds: ['a'], responsibilityId: 'x' })).toEqual(['a']);
    expect(getPeopleResponsibilityIds(undefined)).toEqual([]);
  });
});

describe('splitIntoRows', () => {
  it('distributes round-robin', () => {
    expect(splitIntoRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 3, 5], [2, 4]]);
  });
  it('clamps to 1..4 and drops empty lines', () => {
    expect(splitIntoRows([1, 2], 9)).toEqual([[1], [2]]);
    expect(splitIntoRows([1, 2], 0)).toEqual([[1, 2]]);
  });
});

describe('toHexColor', () => {
  it('converts rgb(), #rgb and #rrggbb', () => {
    expect(toHexColor(' rgb(16, 32, 255) ')).toBe('#1020ff');
    expect(toHexColor('#AbC')).toBe('#aabbcc');
    expect(toHexColor('#3880FF')).toBe('#3880ff');
  });
  it('is undefined for anything else', () => {
    expect(toHexColor('var(--x)')).toBeUndefined();
    expect(toHexColor(undefined)).toBeUndefined();
  });
});

describe('getPeopleResponsibilityParentKey', () => {
  it('reads the trimmed key', () => {
    expect(getPeopleResponsibilityParentKey({ responsibilityParentKey: ' group.g1 ' })).toBe('group.g1');
  });

  it('is empty when missing or not a plain key', () => {
    expect(getPeopleResponsibilityParentKey(undefined)).toBe('');
    expect(getPeopleResponsibilityParentKey({ responsibilityParentKey: 'group/g1' })).toBe('');
  });
});

describe('getResponsibilityKeysUnderParent', () => {
  const role = (okey: string, name: string, last: string, patch: Record<string, unknown> = {}) =>
    ({ okey, name, parentKey: 'group.team', responsibleAvatar: { name1: 'X', name2: last }, ...patch });

  it('lists the roles of the parent by name, then the responsible\'s last name', () => {
    const roles = [
      role('t2', 'Trainer', 'Zahn'),
      role('js', 'J+S Leiter', 'Meier'),
      role('t1', 'Trainer', 'Amrein'),
      role('head', 'Cheftrainer', 'Jucker'),
    ];
    expect(getResponsibilityKeysUnderParent(roles, 'group.team', '20261117')).toEqual(['head', 'js', 't1', 't2']);
  });

  it('leaves out other parents, archived roles and roles not valid today', () => {
    const roles = [
      role('a', 'A', 'A'),
      role('other', 'B', 'B', { parentKey: 'group.other' }),
      role('archived', 'C', 'C', { isArchived: true }),
      role('ended', 'D', 'D', { validTo: '20261116' }),
      role('future', 'E', 'E', { validFrom: '20261118' }),
      role('today', 'F', 'F', { validFrom: '20261117', validTo: '20261117' }),
    ];
    expect(getResponsibilityKeysUnderParent(roles, 'group.team', '20261117')).toEqual(['a', 'today']);
  });

  it('is empty without a parent', () => {
    expect(getResponsibilityKeysUnderParent([role('a', 'A', 'A')], '', '20261117')).toEqual([]);
  });
});

describe('mergeResponsibilityKeys', () => {
  it('keeps the chosen first and lists each key once', () => {
    expect(mergeResponsibilityKeys(['head', 'x'], ['js', 'head', 't1'])).toEqual(['head', 'x', 'js', 't1']);
  });
});

describe('getPeopleExcludedKeys', () => {
  const avatar = (key: string): AvatarInfo => ({ key, name1: '', name2: '', label: '', modelType: 'person', type: '', subType: '' });

  it('reads the trimmed, deduped keys of a group section', () => {
    expect(getPeopleExcludedKeys({ type: 'group', excludedPersons: [avatar(' p1 '), avatar('p2'), avatar('p1'), avatar('')] })).toEqual(['p1', 'p2']);
  });

  it('hides nobody for another type or without a list', () => {
    expect(getPeopleExcludedKeys({ type: 'responsibility', excludedPersons: [avatar('p1')] })).toEqual([]);
    expect(getPeopleExcludedKeys({ excludedPersons: [avatar('p1')] })).toEqual([]);
    expect(getPeopleExcludedKeys({ type: 'group' })).toEqual([]);
    expect(getPeopleExcludedKeys(undefined)).toEqual([]);
  });
});

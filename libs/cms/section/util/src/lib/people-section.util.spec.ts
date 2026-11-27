import { describe, expect, it } from 'vitest';

import { AVATAR_CONFIG_SHAPE, AvatarConfig, AvatarInfo, NameDisplay, PeopleLook, resolvePeopleLook } from '@okr/shared-models';

import {
  getPeopleAltText, getPeopleBgColor, getPeopleImgixParams, getPeopleResponsibilityIds, getPeopleResponsibilityParentKey, getResponsibilityKeysUnderParent, mergeResponsibilityKeys, normalizeAvatarConfig, splitIntoRows, toHexColor
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

const look = (patch: Partial<PeopleLook> = {}): PeopleLook => ({ ...resolvePeopleLook(undefined), ...patch });

describe('resolvePeopleLook over normalizeAvatarConfig', () => {
  it('still reads the old width: normalizeAvatarConfig injects no new field', () => {
    expect(resolvePeopleLook(normalizeAvatarConfig({ imgWidth: 300 } as Partial<AvatarConfig>)).size).toBe('L');
  });
});

describe('getPeopleBgColor', () => {
  it('is undefined for the original fill', () => {
    expect(getPeopleBgColor(look({ fill: 'original' }), 0, '#112233')).toBeUndefined();
  });
  it('primary always uses the first colour', () => {
    expect([0, 1, 5].map(i => getPeopleBgColor(look({ fill: 'primary' }), i, ['#111111', '#222222']))).toEqual(['#111111', '#111111', '#111111']);
    expect(getPeopleBgColor(look({ fill: 'primary' }), 3, '#112233')).toBe('#112233');
  });
  it('alternating cycles the list', () => {
    const l = look({ fill: 'alternating' });
    expect([0, 1, 2].map(i => getPeopleBgColor(l, i, ['#111111', '#222222']))).toEqual(['#111111', '#222222', '#111111']);
  });
  it('is undefined without a valid colour', () => {
    expect(getPeopleBgColor(look({ fill: 'primary' }), 0, 'nope')).toBeUndefined();
    expect(getPeopleBgColor(look({ fill: 'primary' }), 0)).toBeUndefined();
  });
});

describe('getPeopleImgixParams', () => {
  it('draws a square of the size at 2x and crops on faces', () => {
    expect(getPeopleImgixParams(look({ size: 'S', fill: 'original' }))).toBe('w=120&h=120&dpr=2&auto=format,compress&fit=crop&crop=faces');
    expect(getPeopleImgixParams(look({ size: 'L', fill: 'original' }))).toContain('w=300&h=300');
  });
  it('removes the background for a filled look, with the fill colour', () => {
    const params = getPeopleImgixParams(look({ size: 'M', fill: 'primary' }), '#a1b2c3');
    expect(params).not.toContain('sat=-100');
    expect(params).toContain('bg-remove=true');
    expect(params).toContain('bg=A1B2C3');
  });
  it('greys only the person on a cut-out: no imgix fill, so the colour stays', () => {
    expect(getPeopleImgixParams(look({ size: 'M', fill: 'primary', grayscale: true }), '#a1b2c3'))
      .toBe('w=200&h=200&dpr=2&auto=format,compress&fit=crop&crop=faces&sat=-100&bg-remove=true');
  });
  it('greys the whole original photo', () => {
    const params = getPeopleImgixParams(look({ fill: 'original', grayscale: true }));
    expect(params).toContain('sat=-100');
    expect(params).not.toContain('bg-remove');
  });
  it('never removes the background of an original photo', () => {
    expect(getPeopleImgixParams(look({ fill: 'original' }), '#a1b2c3')).not.toContain('bg');
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


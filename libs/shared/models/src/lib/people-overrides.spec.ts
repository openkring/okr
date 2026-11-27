import { describe, expect, it } from 'vitest';

import { applyPeopleOverrides, cleanPeopleConfig, peopleHiddenKeys } from './people-overrides';
import type { PeopleConfig } from './section.model';

const p = ['a', 'b', 'c', 'd'].map((key) => ({ key }));
const keys = (l: { key: string }[]) => l.map((x) => x.key).join('');
const cfg = (c: Partial<PeopleConfig>) => ({ type: 'group', ...c }) as Partial<PeopleConfig>;

describe('applyPeopleOverrides', () => {
  it('orders', () => expect(keys(applyPeopleOverrides(p, cfg({ orderKeys: ['c', 'a'] })))).toBe('cabd'));
  it('hides, or keeps hidden', () => {
    expect(keys(applyPeopleOverrides(p, cfg({ hiddenKeys: ['b'] })))).toBe('acd');
    expect(keys(applyPeopleOverrides(p, cfg({ hiddenKeys: ['b'] }), { keepHidden: true }))).toBe('abcd');
  });
  it('ignores duplicates, blanks and unknown keys', () => {
    expect(keys(applyPeopleOverrides(p, cfg({ orderKeys: ['c', 'c', '', 'x'] })))).toBe('cabd');
  });
  it('hidden beats order', () => {
    expect(keys(applyPeopleOverrides(p, cfg({ hiddenKeys: ['c'], orderKeys: ['c', 'a'] })))).toBe('abd');
  });
  it('type persons ignores orderKeys', () => {
    expect(keys(applyPeopleOverrides(p, { type: 'persons', orderKeys: ['c', 'a'] }))).toBe('abcd');
  });
  it('does not mutate', () => {
    const copy = [...p];
    applyPeopleOverrides(p, cfg({ orderKeys: ['d'] }));
    expect(p).toEqual(copy);
  });
});

describe('peopleHiddenKeys', () => {
  it('uses excludedPersons for group only', () => {
    const excludedPersons = [{ key: 'b' }] as PeopleConfig['excludedPersons'];
    expect(peopleHiddenKeys({ type: 'group', excludedPersons })).toEqual(['b']);
    expect(peopleHiddenKeys({ type: 'persons', excludedPersons })).toEqual([]);
  });
});

describe('cleanPeopleConfig', () => {
  const avatar = { altText: 'x', nameDisplay: 1, title: 't', view: 'grid', info: ['function'], grayscale: true, imgWidth: 300, imgHeight: 300,
    imgRadius: '5px', facePad: 1, background: 'orgColor', bgOrgColor: 'primary', bgColors: [], color: 'light', perRow: 4, sliderRows: 1,
    infoPosition: 'right', showName: true, showLabel: true } as unknown as PeopleConfig['avatar'];

  it('persons: drops other sources and old look', () => {
    const out = cleanPeopleConfig({ avatar, type: 'persons', persons: [], groupId: 'g', responsibilityId: 'r', excludedPersons: [{ key: 'b' }] } as unknown as PeopleConfig, ['a']);
    expect(out.groupId).toBeUndefined();
    expect(out.responsibilityId).toBeUndefined();
    expect(out.excludedPersons).toBeUndefined();
    const a = out.avatar as unknown as Record<string, unknown>;
    for (const f of ['imgWidth', 'imgHeight', 'imgRadius', 'facePad', 'background', 'bgOrgColor', 'bgColors', 'color', 'perRow', 'sliderRows', 'infoPosition', 'showName', 'showLabel']) expect(a[f]).toBeUndefined();
    expect(a).toMatchObject({ size: 'L', shape: 'rounded', fill: 'primary', textPosition: 'right', grayscale: true, altText: 'x', view: 'grid' });
  });
  it('group: hiddenKeys from excludedPersons, filtered to shown', () => {
    const input = { avatar, type: 'group', persons: [], groupId: 'g', excludedPersons: [{ key: 'b' }], hiddenKeys: ['z'], orderKeys: [] } as unknown as PeopleConfig;
    const out = cleanPeopleConfig(input, ['a', 'b']);
    expect(out.hiddenKeys).toEqual(['b']);
    expect(out.excludedPersons).toBeUndefined();
    expect(out.orderKeys).toBeUndefined();
    expect(out.groupId).toBe('g');
    expect(input.excludedPersons).toBeDefined();
  });
});

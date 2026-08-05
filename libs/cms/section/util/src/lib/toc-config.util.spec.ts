import { describe, expect, it } from 'vitest';

import { SectionModel, UserModel } from '@okr/shared-models';

import { parseTocKeys, stringifyTocKeys, tocEntries, withTocDefaults } from './toc-config.util';

function section(okey: string, overrides: Partial<SectionModel> = {}): SectionModel {
  return {
    okey,
    type: 'article',
    state: 'published',
    name: 'name-' + okey,
    title: 'title-' + okey,
    roleNeeded: 'public',
    ...overrides,
  } as SectionModel;
}

const user = { okey: 'u1', roles: ['registered'] } as unknown as UserModel;

describe('toc-config.util', () => {
  it('coalesces missing fields of legacy configs', () => {
    expect(withTocDefaults(undefined)).toEqual({ sectionKeys: [], numbered: false });
  });

  it('lists all sections in page order, minus itself (auto mode)', () => {
    const sections = [section('a'), section('toc'), section('b')];
    expect(tocEntries(sections, undefined, 'toc', user, false).map(e => e.key)).toEqual(['a', 'b']);
  });

  it('keeps the page order when keys are selected manually', () => {
    const sections = [section('a'), section('b'), section('c')];
    const entries = tocEntries(sections, { sectionKeys: ['c', 'a'], numbered: false }, undefined, user, false);
    expect(entries.map(e => e.key)).toEqual(['a', 'c']);
  });

  it('hides unpublished sections unless in edit mode', () => {
    const sections = [section('a', { state: 'draft' } as Partial<SectionModel>), section('b')];
    expect(tocEntries(sections, undefined, undefined, user, false).map(e => e.key)).toEqual(['b']);
    expect(tocEntries(sections, undefined, undefined, user, true).map(e => e.key)).toEqual(['a', 'b']);
  });

  it('hides sections the user has no role for', () => {
    const sections = [section('a', { roleNeeded: 'admin' } as Partial<SectionModel>), section('b')];
    expect(tocEntries(sections, undefined, undefined, user, false).map(e => e.key)).toEqual(['b']);
  });

  it('falls back to the name when the title is empty, drops entries without a label', () => {
    const sections = [section('a', { title: '' } as Partial<SectionModel>), section('b', { title: '', name: '' } as Partial<SectionModel>)];
    const entries = tocEntries(sections, undefined, undefined, user, false);
    expect(entries).toEqual([{ key: 'a', label: 'name-a' }]);
  });

  it('parses keys from lines or commas and renders them back', () => {
    expect(parseTocKeys(' a , b \n c \n\n')).toEqual(['a', 'b', 'c']);
    expect(stringifyTocKeys(['a', 'b'])).toBe('a\nb');
    expect(stringifyTocKeys(undefined)).toBe('');
  });
});

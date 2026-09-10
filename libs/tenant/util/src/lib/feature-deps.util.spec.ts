import { describe, expect, it } from 'vitest';
import { holdersOf, resolveWithDeps } from './feature-deps.util';
import type { FeatureBlock } from './feature-catalogue.types';

const block = (id: string, dependsOn: string[] = []): FeatureBlock => ({
  id, bundle: 'special', label: `@f.${id}`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn, menu: [], collections: [],
});

describe('resolveWithDeps', () => {
  const catalogue = [
    block('person'), block('org'),
    block('calevent', ['person']),
    block('finance', ['person', 'org']),
    block('esign', ['finance']),
  ];

  it('returns the requested block when it has no dependencies', () => {
    expect(resolveWithDeps(catalogue, ['person'])).toEqual(['person']);
  });

  it('pulls in a direct dependency', () => {
    expect(resolveWithDeps(catalogue, ['calevent']).sort()).toEqual(['calevent', 'person']);
  });

  it('pulls in transitive dependencies', () => {
    expect(resolveWithDeps(catalogue, ['esign']).sort())
      .toEqual(['esign', 'finance', 'org', 'person']);
  });

  it('deduplicates when two blocks share a dependency', () => {
    const result = resolveWithDeps(catalogue, ['calevent', 'finance']);
    expect(result.filter(id => id === 'person')).toHaveLength(1);
  });

  it('ignores an unknown block id rather than throwing', () => {
    expect(resolveWithDeps(catalogue, ['nope'])).toEqual([]);
  });

  it('terminates on a dependency cycle', () => {
    const cyclic = [block('a', ['b']), block('b', ['a'])];
    expect(resolveWithDeps(cyclic, ['a']).sort()).toEqual(['a', 'b']);
  });
});

describe('holdersOf', () => {
  const catalogue = [
    block('person'), block('org'),
    block('calevent', ['person']),
    block('finance', ['person', 'org']),
    block('esign', ['finance']),
    block('weather'),
  ];

  it('names the active block that depends on it', () => {
    expect(holdersOf(catalogue, 'person', ['calevent', 'weather'])).toEqual(['calevent']);
  });

  it('counts an indirect holder — esign → finance → person', () => {
    expect(holdersOf(catalogue, 'person', ['esign'])).toEqual(['esign']);
  });

  it('is empty when nothing active depends on it — the block is free to switch off', () => {
    expect(holdersOf(catalogue, 'person', ['weather', 'org'])).toEqual([]);
  });

  it('never reports the block itself, even though it is active', () => {
    expect(holdersOf(catalogue, 'person', ['person'])).toEqual([]);
  });

  it('reports every holder, so the message can name them all', () => {
    expect(holdersOf(catalogue, 'person', ['calevent', 'finance', 'weather']).sort())
      .toEqual(['calevent', 'finance']);
  });
});

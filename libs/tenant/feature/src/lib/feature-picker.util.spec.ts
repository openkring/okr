import { describe, expect, it } from 'vitest';
import {
  dependentsOf, escapeHtml, menuReferencesByName, transitiveDependentsOf,
} from './feature-picker.util';
import type { FeatureBlock, MenuSpec } from '@okr/tenant-util';

// `FeatureBlock` (feature-catalogue.types.ts) has no `routes` field — that lives in
// `@okr/tenant-routes`'s `BlockRoutes` now (split out to break a circular dependency, see
// that type's doc comment). The brief's fixture predates the split; build it from the real
// fields only.
const block = (id: string, dependsOn: string[] = [], overrides: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@feature.${id}.label`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn, menu: [], collections: [], ...overrides,
});

describe('dependentsOf', () => {
  const catalogue = [
    block('person'), block('calevent', ['person']),
    block('finance', ['person']), block('esign', ['finance']),
  ];

  it('lists blocks that directly depend on the given block', () => {
    expect(dependentsOf(catalogue, 'person').sort()).toEqual(['calevent', 'finance']);
  });

  it('returns only the direct dependent of an intermediate node, not its own dependants', () => {
    // 'esign' depends on 'finance', not on 'person' directly — dependentsOf is one hop only,
    // by design (see its doc comment); the transitive chain is `transitiveDependentsOf`'s job.
    expect(dependentsOf(catalogue, 'finance')).toEqual(['esign']);
  });

  it('returns an empty list for a leaf', () => {
    expect(dependentsOf(catalogue, 'esign')).toEqual([]);
  });
});

describe('transitiveDependentsOf', () => {
  const catalogue = [
    block('person'), block('calevent', ['person']),
    block('finance', ['person']), block('esign', ['finance']),
  ];

  it('walks the full chain: person -> calevent, finance -> esign', () => {
    expect(transitiveDependentsOf(catalogue, 'person', new Set(['person', 'calevent', 'finance', 'esign'])).sort())
      .toEqual(['calevent', 'esign', 'finance']);
  });

  it('only reports dependants that are currently selected', () => {
    // 'esign' depends on 'finance' but is not ticked — no warning needed for it.
    expect(transitiveDependentsOf(catalogue, 'person', new Set(['person', 'calevent', 'finance'])).sort())
      .toEqual(['calevent', 'finance']);
  });

  it('returns an empty list for a leaf', () => {
    expect(transitiveDependentsOf(catalogue, 'esign', new Set(['person', 'calevent', 'finance', 'esign']))).toEqual([]);
  });
});

describe('menuReferencesByName', () => {
  const child = (key: string): MenuSpec => ({
    key, name: key, url: '/' + key, action: 'navigate',
    roleNeeded: 'admin', icon: 'help-circle', label: '@item.' + key,
  });
  const parent = (key: string, children: MenuSpec[]): MenuSpec => ({
    key, name: key, url: '', action: 'sub',
    roleNeeded: 'admin', icon: 'help-circle', label: '@item.' + key, children,
  });

  const catalogue = [
    block('calevent', [], { menu: [parent('c-calevents', [child('filter-toggle')])] }),
    block('document', [], { menu: [parent('c-documents', [child('filter-toggle')])] }),
    block('trip', [], { menu: [child('trip-all')] }),
  ];

  it('collects every block that declares the same menu name', () => {
    expect(menuReferencesByName(catalogue).get('filter-toggle')?.blockIds)
      .toEqual(['calevent', 'document']);
  });

  it('collects the parents a name is nested under', () => {
    expect(menuReferencesByName(catalogue).get('filter-toggle')?.parents)
      .toEqual(['c-calevents', 'c-documents']);
  });

  it('leaves a root-nav entry without parents', () => {
    expect(menuReferencesByName(catalogue).get('trip-all')).toEqual({ blockIds: ['trip'], parents: [] });
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that would break out of an alert message', () => {
    expect(escapeHtml('<b>a & "b"</b>')).toBe('&lt;b&gt;a &amp; &quot;b&quot;&lt;/b&gt;');
  });

  it('leaves an ordinary menu name untouched', () => {
    expect(escapeHtml('calevent-export-raw')).toBe('calevent-export-raw');
  });
});

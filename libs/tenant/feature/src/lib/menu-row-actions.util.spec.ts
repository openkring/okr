import { describe, expect, it } from 'vitest';

import type { MenuStructureDrift } from '@okr/tenant-util';

import { actionableFieldsOf, patchNoteFor } from './menu-row-actions.util';
import type { MenuTreeRow } from './menu-tree.util';

function makeRow(overrides: Partial<MenuTreeRow> = {}): MenuTreeRow {
  return {
    name: 'sport-menu', docId: 'sport-menu', depth: 0, state: 'drifted',
    roleNeededLive: 'registered', roleNeededCatalogue: 'registered',
    otherDrift: [], blockId: 'sport', forked: false, action: 'sub', groupKeys: [],
    ...overrides,
  };
}

function makeDrift(overrides: Partial<MenuStructureDrift> = {}): MenuStructureDrift {
  return {
    name: 'sport-menu', docId: 'sport-menu', forked: false, pinned: [],
    fields: {}, live: {},
    ...overrides,
  };
}

describe('actionableFieldsOf', () => {
  it('returns undefined-drift as no actionable fields', () => {
    expect(actionableFieldsOf(undefined)).toEqual([]);
  });

  it('returns every differing field when nothing is pinned', () => {
    const drift = makeDrift({ fields: { url: '/new', roleNeeded: 'admin' } });
    expect(actionableFieldsOf(drift).sort()).toEqual(['roleNeeded', 'url']);
  });

  it('drops a pinned field even though it still differs', () => {
    const drift = makeDrift({ fields: { url: '/new', roleNeeded: 'admin' }, pinned: ['roleNeeded'] });
    expect(actionableFieldsOf(drift)).toEqual(['url']);
  });

  it('returns nothing when every differing field is pinned', () => {
    const drift = makeDrift({ fields: { roleNeeded: 'admin' }, pinned: ['roleNeeded'] });
    expect(actionableFieldsOf(drift)).toEqual([]);
  });
});

describe('patchNoteFor', () => {
  it('names the row, its document, and each actionable field with catalogue vs. live values', () => {
    const row = makeRow();
    const drift = makeDrift({
      fields: { url: '/old-url' },
      live: { url: '/new-url' },
    });
    const note = patchNoteFor(row, drift, ['url']);
    expect(note).toContain('sport-menu');
    expect(note).toContain('Baustein sport');
    expect(note).toContain('Dokument: sport-menu');
    expect(note).toContain('url: Katalog heute «/old-url» -> soll werden «/new-url»');
  });

  it('falls back to the row name when docId is empty', () => {
    const row = makeRow({ docId: '', blockId: '' });
    const drift = makeDrift();
    const note = patchNoteFor(row, drift, []);
    expect(note).toContain('Dokument: sport-menu');
    expect(note).not.toContain('Baustein');
  });
});

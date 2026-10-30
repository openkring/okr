import { describe, expect, it } from 'vitest';
import { blockActions, footprintMenu, JournalMenuItem, journalListMenu, journalOverviewMenu } from './journal-menu.util';

const actions = (items: JournalMenuItem[]) => items.map((i) => i.action);

describe('journal menus (spec 1.126 phase 3: write entries follow canWrite)', () => {
  it('list: native author offers new journal and photo sync', () => {
    expect(actions(journalListMenu({ native: true, canWrite: true }))).toEqual(['newJournal', 'photoSync']);
  });

  it('list: browser author offers new journal only', () => {
    expect(actions(journalListMenu({ native: false, canWrite: true }))).toEqual(['newJournal']);
  });

  it('list: without write permission nothing', () => {
    expect(journalListMenu({ native: false, canWrite: false })).toEqual([]);
    expect(journalListMenu({ native: true, canWrite: false })).toEqual([]);
  });

  it('overview: native author order', () => {
    expect(actions(journalOverviewMenu({ native: true, canWrite: true, hasFlyover: true })))
      .toEqual(['flyover', 'newFootprint', 'recordTrack', 'photoSync', 'divider', 'offlineMaps', 'photoBook']);
  });

  it('overview: browser author gets new footprint, no native-only entries', () => {
    expect(actions(journalOverviewMenu({ native: false, canWrite: true, hasFlyover: true })))
      .toEqual(['flyover', 'newFootprint', 'photoBook']);
  });

  it('overview: without write permission flyover and photo book only', () => {
    expect(actions(journalOverviewMenu({ native: false, canWrite: false, hasFlyover: true }))).toEqual(['flyover', 'photoBook']);
    // the native overview keeps its divider between the groups
    expect(actions(journalOverviewMenu({ native: true, canWrite: false, hasFlyover: true }))).toEqual(['flyover', 'divider', 'photoBook']);
  });

  it('overview: no flyover entry without a flyover', () => {
    expect(actions(journalOverviewMenu({ native: false, canWrite: false, hasFlyover: false }))).toEqual(['photoBook']);
  });

  it('footprint: author, edit mode off and on, on every device', () => {
    for (const native of [true, false]) {
      const off = footprintMenu({ native, canWrite: true, editMode: false });
      expect(actions(off)).toEqual(['toggleEditMode', 'addBlock', 'sortBlocks', 'divider', 'editFootprint', 'deleteFootprint']);
      expect(off[0]).toMatchObject({ label: 'menu_edit_on' });
      expect(footprintMenu({ native, canWrite: true, editMode: true })[0]).toMatchObject({ label: 'menu_edit_off' });
      expect(off[off.length - 1]).toMatchObject({ destructive: true });
    }
  });

  it('footprint: without write permission no menu', () => {
    expect(footprintMenu({ native: false, canWrite: false, editMode: false })).toEqual([]);
    expect(footprintMenu({ native: true, canWrite: false, editMode: false })).toEqual([]);
  });

  it('block actions follow kind and editability', () => {
    expect(blockActions({ kind: 'text', editable: true })).toEqual(['block.edit', 'block.delete']);
    expect(blockActions({ kind: 'photos', editable: true })).toEqual(['block.addphotos', 'block.delete']);
    expect(blockActions({ kind: 'text', editable: false })).toEqual([]);
  });
});

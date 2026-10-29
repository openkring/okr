import { describe, expect, it } from 'vitest';
import { blockActions, footprintMenu, JournalMenuItem, journalListMenu, journalOverviewMenu } from './journal-menu.util';

const actions = (items: JournalMenuItem[]) => items.map((i) => i.action);

describe('journal menus (spec 1.126 phase 1)', () => {
  it('list: native offers new journal and photo sync; the browser offers nothing', () => {
    expect(actions(journalListMenu({ native: true }))).toEqual(['newJournal', 'photoSync']);
    expect(journalListMenu({ native: false })).toEqual([]);
  });

  it('overview: native order', () => {
    expect(actions(journalOverviewMenu({ native: true, hasFlyover: true })))
      .toEqual(['flyover', 'newFootprint', 'recordTrack', 'photoSync', 'divider', 'offlineMaps', 'photoBook']);
  });

  it('overview: browser keeps flyover and photo book only', () => {
    expect(actions(journalOverviewMenu({ native: false, hasFlyover: true }))).toEqual(['flyover', 'photoBook']);
  });

  it('overview: no flyover entry without a flyover', () => {
    expect(actions(journalOverviewMenu({ native: false, hasFlyover: false }))).toEqual(['photoBook']);
  });

  it('footprint: native, edit mode off and on', () => {
    const off = footprintMenu({ native: true, editMode: false });
    expect(actions(off)).toEqual(['toggleEditMode', 'addBlock', 'divider', 'editFootprint', 'deleteFootprint']);
    expect(off[0]).toMatchObject({ label: 'menu_edit_on' });
    expect(footprintMenu({ native: true, editMode: true })[0]).toMatchObject({ label: 'menu_edit_off' });
    expect(off[off.length - 1]).toMatchObject({ destructive: true });
  });

  it('footprint: the browser gets no menu in phase 1', () => {
    expect(footprintMenu({ native: false, editMode: false })).toEqual([]);
  });

  it('block actions follow kind and ownership', () => {
    expect(blockActions({ kind: 'text', own: true })).toEqual(['block.edit', 'block.delete']);
    expect(blockActions({ kind: 'photos', own: true })).toEqual(['block.addphotos', 'block.delete']);
    expect(blockActions({ kind: 'text', own: false })).toEqual([]);
  });
});

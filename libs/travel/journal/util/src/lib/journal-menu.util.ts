import { JOURNAL_I18N_KEYS } from './journal-i18n';

/**
 * The context menus of the journal pages (spec 1.126 §3–§5). Code-defined, not `menuItems` rows: the
 * journal routes run before the app-ready gate and must work offline, where a Firestore menu may be empty.
 * Phase 3: write entries follow `canWrite` on every device; native-only entries also need `native`.
 */
export type JournalMenuAction =
  | 'newJournal' | 'photoSync'
  | 'flyover' | 'newFootprint' | 'recordTrack' | 'offlineMaps' | 'photoBook'
  | 'toggleEditMode' | 'addBlock' | 'sortBlocks' | 'editFootprint' | 'deleteFootprint';

export type JournalBlockAction = 'block.edit' | 'block.addphotos' | 'block.delete';

export type JournalMenuItem =
  | { action: JournalMenuAction; label: keyof typeof JOURNAL_I18N_KEYS; icon: string; destructive?: boolean }
  | { action: 'divider' };

const DIVIDER: JournalMenuItem = { action: 'divider' };

/** Joins groups with a divider between non-empty ones. */
function grouped(...groups: JournalMenuItem[][]): JournalMenuItem[] {
  return groups.filter((g) => g.length > 0).flatMap((g, i) => (i === 0 ? g : [DIVIDER, ...g]));
}

export function journalListMenu(ctx: { native: boolean; canWrite: boolean }): JournalMenuItem[] {
  if (!ctx.canWrite) return [];
  const items: JournalMenuItem[] = [{ action: 'newJournal', label: 'menu_new_journal', icon: 'add' }];
  if (ctx.native) items.push({ action: 'photoSync', label: 'menu_photo_sync', icon: 'sync-circle' });
  return items;
}

export function journalOverviewMenu(ctx: { native: boolean; canWrite: boolean; hasFlyover: boolean }): JournalMenuItem[] {
  const nativeWrite = ctx.native && ctx.canWrite;
  const work: JournalMenuItem[] = [];
  if (ctx.hasFlyover) work.push({ action: 'flyover', label: 'flyover', icon: 'airplane' });
  if (ctx.canWrite) work.push({ action: 'newFootprint', label: 'footprints_new', icon: 'add' });
  if (nativeWrite) {
    work.push(
      { action: 'recordTrack', label: 'tracker_record', icon: 'navigate' },
      { action: 'photoSync', label: 'menu_photo_sync', icon: 'sync-circle' },
    );
  }
  const manage: JournalMenuItem[] = [];
  if (nativeWrite) manage.push({ action: 'offlineMaps', label: 'menu_offline_maps', icon: 'map' });
  manage.push({ action: 'photoBook', label: 'menu_photo_book', icon: 'book' });
  // the browser lists its few entries without a divider
  return ctx.native ? grouped(work, manage) : [...work, ...manage];
}

export function footprintMenu(ctx: { native: boolean; canWrite: boolean; editMode: boolean }): JournalMenuItem[] {
  if (!ctx.canWrite) return [];
  return grouped(
    [
      { action: 'toggleEditMode', label: ctx.editMode ? 'menu_edit_off' : 'menu_edit_on', icon: 'edit' },
      { action: 'addBlock', label: 'menu_add_block', icon: 'add' },
      { action: 'sortBlocks', label: 'menu_sort_blocks', icon: 'sync-circle' },
    ],
    [
      { action: 'editFootprint', label: 'menu_edit_footprint', icon: 'edit' },
      { action: 'deleteFootprint', label: 'menu_delete_footprint', icon: 'trash', destructive: true },
    ],
  );
}

/** The block ActionSheet's actions; every author may edit every block (phase 2), `editable` = `canWrite`. */
export function blockActions(ctx: { kind: 'text' | 'photos'; editable: boolean }): JournalBlockAction[] {
  if (!ctx.editable) return [];
  return [ctx.kind === 'text' ? 'block.edit' : 'block.addphotos', 'block.delete'];
}

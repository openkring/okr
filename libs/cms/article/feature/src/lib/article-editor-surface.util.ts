import {
  ARTICLE_PROFILE, blocksInOrder, findBlock, insertArticleBlocks, isArticleChanged, record, redo, replaceBlock, replacePresent, resizeColumn, setColumnSizes, undo, withUpload, withValidSelection,
  type ArticlePreviewDevice, type ArticleUpload, type EditorHistory, type EditorProfile, type EditorState,
} from '@okr/cms-section-util';
import { isSameValue, type ArticleBlock, type ArticleSection, type ColumnsBlock, type MailBlock } from '@okr/shared-models';

import type { CanvasChange } from './article-canvas.util';

/** The rules of the editor surface (spec 1.175 §7, 1.176 §10), without Angular and Ionic: for the surface and its hosts. Nothing is mutated. */

type History = EditorHistory<EditorState>;

// ------------------------------------------------------- history -------------------------------------------------------

function withSelection(state: EditorState, selectedId: string | undefined): EditorState {
  if (selectedId === undefined) return state.selectedId === undefined ? state : { ...state, selectedId };
  const { selectedId: valid } = withValidSelection({ section: state.section, selectedId });
  return state.selectedId === valid ? state : { ...state, selectedId: valid };
}

/** The blocks of a state; those of a mail may be events. */
export function editorBlocks(state: EditorState): MailBlock[] {
  return state.section.properties?.blocks ?? [];
}

/** The section with these blocks. The one of a mail (`mailArticle`) holds its blocks under the type of an article. */
export function withBlocks(section: ArticleSection, blocks: MailBlock[]): ArticleSection {
  return { ...section, properties: { ...section.properties, blocks: blocks as ArticleBlock[] } };
}

/**
 * What the author did in the canvas. Its `copies` (source → copy; joined text → text above) are turned around and never replace an
 * origin. A block of the opened article has none: for a join only the origin of a new text above counts.
 */
export function stateAfterChange(state: EditorState, change: CanvasChange<MailBlock>, openedIds: ReadonlySet<string>): EditorState {
  const added = Object.entries(change.copies ?? {}).filter(([, to]) => !openedIds.has(to) && !(to in state.copiedFrom));
  return {
    section: withBlocks(state.section, change.blocks),
    selectedId: change.selectedId,
    copiedFrom: added.length === 0 ? state.copiedFrom : { ...Object.fromEntries(added.map(([from, to]) => [to, from])), ...state.copiedFrom },
  };
}

/** A step with another section; the selection stays while its block exists. The same section is no step. */
export function changeSection(history: History, section: ArticleSection, tag?: string): History {
  if (section === history.present.section) return history;
  return record(history, withSelection({ ...history.present, section }, history.present.selectedId), { tag });
}

/** A step back to a state that is not the one before, with what is selected now. */
export function restore(history: History, state: EditorState): History {
  return record(history, withSelection(state, history.present.selectedId));
}

/** A step with other blocks. The same array is no step. */
export function changeBlocks(history: History, blocks: MailBlock[], tag?: string): History {
  return blocks === editorBlocks(history.present) ? history : changeSection(history, withBlocks(history.present.section, blocks), tag);
}

/**
 * «Artikel einfügen» (spec 1.176 §8.3): one step that puts `inserted` after the selected top-level block (after the columns block for one inside
 * a column), else at the end, and selects the last of them. `'full'` when the mail would have more than 50 blocks: nothing is inserted.
 */
export function insertedInto(history: History, inserted: MailBlock[]): History | 'full' {
  const result = insertArticleBlocks(editorBlocks(history.present), inserted, history.present.selectedId);
  if (result === 'full' || result.lastId === undefined) return result === 'full' ? result : history;
  return record(history, { ...history.present, section: withBlocks(history.present.section, result.blocks), selectedId: result.lastId });
}

/** Selects a block (no step). */
export function selectIn(history: History, id: string | undefined): History {
  const next = withSelection(history.present, id);
  return next === history.present ? history : replacePresent(history, next);
}

/**
 * Undo. Selects the block that changes by it (§7.7). When one only goes away, what was selected before the step is selected again.
 * Steps that change nothing (typed and deleted again) are passed over.
 */
export function stepBack(history: History): History {
  return stepped(history, undo, true);
}

/** Redo. Selects the block that changes by it; nothing when one only goes away. Steps that change nothing are passed over. */
export function stepForward(history: History): History {
  return stepped(history, redo, false);
}

function stepped(from: History, step: (history: History) => History, backToRecorded: boolean): History {
  const changes = (to: History): boolean => isArticleChanged(from.present.section, to.present.section);
  let to = step(from);
  if (to === from) return from;
  for (let next = step(to); next !== to && !changes(to); next = step(to)) to = next;
  if (!changes(to)) return replacePresent(to, withSelection(to.present, from.present.selectedId));
  const [before, after] = [editorBlocks(from.present), editorBlocks(to.present)];
  const affected = affectedBlocks(before, after);
  const recorded = to.present.selectedId;
  let selected: string | undefined;
  if (recorded !== undefined && affected.includes(recorded)) selected = recorded;
  else if (affected.length > 0) selected = affected[0];
  else if (backToRecorded && isGone(before, after)) selected = recorded;
  const present = withSelection(to.present, selected);
  return present === to.present ? to : replacePresent(to, present);
}

const isGone = (before: MailBlock[], after: MailBlock[]): boolean => {
  const left = new Set(blocksInOrder(after).map((block) => block.id));
  return blocksInOrder(before).some((block) => !left.has(block.id));
};

/** A block without its inner blocks, and where it stands. */
interface Placed { list: string; own: unknown }

function placed(blocks: MailBlock[]): { byId: Map<string, Placed>; lists: Map<string, string[]> } {
  const byId = new Map<string, Placed>();
  const lists = new Map<string, string[]>();
  for (const block of blocksInOrder(blocks)) {
    const place = findBlock(blocks, block.id)?.place;
    const list = place?.columnsId === undefined ? '' : `${place.column}/${place.columnsId}`;
    byId.set(block.id, { list, own: withoutInner(block) });
    lists.set(list, [...(lists.get(list) ?? []), block.id]);
  }
  return { byId, lists };
}

function withoutInner(block: MailBlock): unknown {
  if (block.type !== 'columns' || !Array.isArray(block.columns)) return block;
  return { ...block, columns: block.columns.map((column) => (typeof column === 'object' && column !== null ? { ...column, blocks: [] } : column)) };
}

/** The blocks of `after` that are new, changed or moved since `before`, in reading order; a columns block only for what is its own. */
export function affectedBlocks(before: MailBlock[], after: MailBlock[]): string[] {
  if (before === after) return [];
  const [was, is] = [placed(before), placed(after)];
  const affected = new Set<string>();
  for (const [id, now] of is.byId) {
    const old = was.byId.get(id);
    if (!old || old.list !== now.list || (old.own !== now.own && !isSameValue(old.own, now.own))) affected.add(id);
  }
  for (const [list, ids] of is.lists) {
    const stayed = (id: string): boolean => was.byId.get(id)?.list === list && is.byId.get(id)?.list === list;
    for (const id of movedIn((was.lists.get(list) ?? []).filter(stayed), ids.filter(stayed))) affected.add(id);
  }
  return [...is.byId.keys()].filter((id) => affected.has(id));
}

/** Two orders of the same ids: the one that was moved (either, when neighbours changed places), else every id at another place. */
function movedIn(before: string[], after: string[]): string[] {
  const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i]);
  if (same(before, after)) return [];
  const without = (ids: string[], id: string): string[] => ids.filter((other) => other !== id);
  const single = after.filter((id) => same(without(before, id), without(after, id)));
  return single.length > 0 ? single : after.filter((id, i) => id !== before[i]);
}

/** Document and attribution of an uploaded picture, found out later: in every state, or an undo would lose them. No step. */
export function withUploadDetails(history: History, upload: Extract<ArticleUpload, { kind: 'details' }>): History {
  const filled = (state: EditorState): EditorState => {
    const section = withUpload(state.section, upload);
    return section === state.section ? state : { ...state, section };
  };
  return { ...history, past: history.past.map(filled), present: filled(history.present), future: history.future.map(filled) };
}

/** What the host of the surface does with an upload (`onUpload`), also when the surface is gone by then. */
export function uploadInto(history: History, upload: ArticleUpload): History {
  return upload.kind === 'details' ? withUploadDetails(history, upload) : changeSection(history, withUpload(history.present.section, upload));
}

// ------------------------------------------------------- columns -------------------------------------------------------

/** The columns around an inner block, without malformed ones, and the place of its column among them. */
function columnsAround(blocks: MailBlock[], id: string): { block: ColumnsBlock; sizes: number[]; index: number } | undefined {
  const place = findBlock(blocks, id)?.place;
  const block = place?.columnsId === undefined ? undefined : findBlock(blocks, place.columnsId)?.block;
  if (block?.type !== 'columns') return undefined;
  const columns = block.columns.filter((column) => typeof column === 'object' && column !== null);
  return { block, sizes: columns.map((column) => column.size), index: columns.indexOf(block.columns[place?.column ?? -1]) };
}

/** Of the column a block stands in: its size (of 12) and the number of columns. */
export function columnOfBlock(blocks: MailBlock[], id: string): { size: number; count: number } | undefined {
  const around = columnsAround(blocks, id);
  return around && { size: around.sizes[around.index], count: around.sizes.length };
}

/** The column a block stands in gets `size`; the others give or take. */
export function withColumnSize<B extends MailBlock>(blocks: B[], id: string, size: number): B[] {
  const around = columnsAround(blocks, id);
  if (!around) return blocks;
  const next = setColumnSizes(around.block, resizeColumn(around.sizes, around.index, size));
  return next === around.block ? blocks : replaceBlock(blocks, next as MailBlock as B);
}

// ------------------------------------------------------- window --------------------------------------------------------

/** A phone has no choice: the canvas shows the real viewport. A device that the profile does not have is its widest one. */
export function deviceFor(chosen: ArticlePreviewDevice, phone: boolean, profile: EditorProfile = ARTICLE_PROFILE): ArticlePreviewDevice {
  if (phone) return 'auto';
  return profile.devices.includes(chosen) ? chosen : profile.devices[profile.devices.length - 1] ?? 'desktop';
}

/** Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Ctrl+Y. */
export function historyKey(event: KeyboardEvent): 'undo' | 'redo' | undefined {
  if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return undefined;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  return key === 'y' && event.ctrlKey && !event.shiftKey ? 'redo' : undefined;
}

const NOT_TYPED: readonly string[] = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color', 'image'];

/** Whether one types into an element, so that the browser's own undo works in it. */
export function isTypedInto(element: Element): boolean {
  if (element.tagName === 'INPUT') return !NOT_TYPED.includes((element as HTMLInputElement).type);
  return element.tagName === 'TEXTAREA' || (element as HTMLElement).isContentEditable === true;
}

/** What Ionic counts as an overlay that takes the keys, see its `trapKeyboardFocus`. */
const OVERLAYS = 'ion-alert, ion-action-sheet, ion-loading, ion-modal, ion-popover';

/** The overlay that stands above all others, if one is open. */
export function topOverlay(): HTMLElement | undefined {
  const open = [...document.querySelectorAll<HTMLElement & { overlayIndex?: number }>(OVERLAYS)]
    .filter((element) => (element.overlayIndex ?? 0) > 0 && !element.classList.contains('overlay-hidden'));
  return open[open.length - 1];
}

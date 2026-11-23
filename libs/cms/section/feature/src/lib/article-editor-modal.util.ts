import {
  findBlock, record, redo, replaceBlock, replacePresent, resizeColumn, setColumnSizes, undo, withUpload, withValidSelection,
  type ArticleEditorState, type ArticlePreviewDevice, type ArticleUpload, type EditorHistory,
} from '@okr/cms-section-util';
import { ARTICLE_SECTION_SHAPE, type ArticleBlock, type ArticleSection, type ColumnsBlock } from '@okr/shared-models';

import type { CanvasChange } from './article-canvas.util';

/** The rules of the article editor's modal (spec 1.175 §7), without Angular and Ionic. Nothing is mutated. */

/** A step of the editor. `copiedFrom` (copy → source, `prepareArticleForSave`) goes with it, so that an undone copy leaves none. */
export interface EditorState extends ArticleEditorState { copiedFrom: Record<string, string> }
type History = EditorHistory<EditorState>;

// ------------------------------------------------------- opening -------------------------------------------------------

/** Fields that the suite requires, with what their absence means to readers ('' is no role). */
const FIELD_DEFAULTS = {
  name: '', title: '', subTitle: '', index: '', notes: '', roleNeeded: '', isArchived: false, color: ARTICLE_SECTION_SHAPE.color,
} as const;

/** Reads apply no model defaults: without these, a stored article that lacks such a field could never be saved. */
export function withFieldDefaults(section: ArticleSection): ArticleSection {
  const stored = section as unknown as Record<string, unknown>;
  const missing = Object.entries(FIELD_DEFAULTS).filter(([key]) => stored[key] === undefined || stored[key] === null);
  return missing.length === 0 ? section : { ...section, ...Object.fromEntries(missing) } as ArticleSection;
}

// ------------------------------------------------------- history -------------------------------------------------------

function withSelection(state: EditorState, selectedId: string | undefined): EditorState {
  if (selectedId === undefined) return state.selectedId === undefined ? state : { ...state, selectedId };
  const { selectedId: valid } = withValidSelection({ section: state.section, selectedId });
  return state.selectedId === valid ? state : { ...state, selectedId: valid };
}

export function withBlocks(section: ArticleSection, blocks: ArticleBlock[]): ArticleSection {
  return { ...section, properties: { ...section.properties, blocks } };
}

/**
 * What the author did in the canvas. Its `copies` (source → copy; joined text → text above) are turned around and never replace an
 * origin. A block of the opened article has none: for a join only the origin of a new text above counts.
 */
export function stateAfterChange(state: EditorState, change: CanvasChange, openedIds: ReadonlySet<string>): EditorState {
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

/** Selects a block (no step). */
export function selectIn(history: History, id: string | undefined): History {
  const next = withSelection(history.present, id);
  return next === history.present ? history : replacePresent(history, next);
}

/** Undo. What was selected before the step is selected again, if it is there. */
export function stepBack(history: History): History {
  return validated(undo(history));
}

export function stepForward(history: History): History {
  return validated(redo(history));
}

function validated(history: History): History {
  const present = withSelection(history.present, history.present.selectedId);
  return present === history.present ? history : replacePresent(history, present);
}

/** Document and attribution of an uploaded picture, found out later: in every state, or an undo would lose them. No step. */
export function withUploadDetails(history: History, upload: Extract<ArticleUpload, { kind: 'details' }>): History {
  const filled = (state: EditorState): EditorState => {
    const section = withUpload(state.section, upload);
    return section === state.section ? state : { ...state, section };
  };
  return { ...history, past: history.past.map(filled), present: filled(history.present), future: history.future.map(filled) };
}

// ------------------------------------------------------- columns -------------------------------------------------------

/** The columns around an inner block, without malformed ones, and the place of its column among them. */
function columnsAround(blocks: ArticleBlock[], id: string): { block: ColumnsBlock; sizes: number[]; index: number } | undefined {
  const place = findBlock(blocks, id)?.place;
  const block = place?.columnsId === undefined ? undefined : findBlock(blocks, place.columnsId)?.block;
  if (block?.type !== 'columns') return undefined;
  const columns = block.columns.filter((column) => typeof column === 'object' && column !== null);
  return { block, sizes: columns.map((column) => column.size), index: columns.indexOf(block.columns[place?.column ?? -1]) };
}

/** Of the column a block stands in: its size (of 12) and the number of columns. */
export function columnOfBlock(blocks: ArticleBlock[], id: string): { size: number; count: number } | undefined {
  const around = columnsAround(blocks, id);
  return around && { size: around.sizes[around.index], count: around.sizes.length };
}

/** The column a block stands in gets `size`; the others give or take. */
export function withColumnSize(blocks: ArticleBlock[], id: string, size: number): ArticleBlock[] {
  const around = columnsAround(blocks, id);
  if (!around) return blocks;
  const next = setColumnSizes(around.block, resizeColumn(around.sizes, around.index, size));
  return next === around.block ? blocks : replaceBlock(blocks, next);
}

// ------------------------------------------------------- window --------------------------------------------------------

/** A phone has no choice: the canvas shows the real viewport. */
export function deviceFor(chosen: ArticlePreviewDevice, phone: boolean): ArticlePreviewDevice {
  return phone ? 'auto' : chosen;
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

/** Whether the editor may be closed. `done`: it was saved and closes by itself. */
export function closeDecision({ done, saving, changed }: { done: boolean; saving: boolean; changed: boolean }): 'allow' | 'refuse' | 'ask' {
  if (done) return 'allow';
  if (saving) return 'refuse';
  return changed ? 'ask' : 'allow';
}

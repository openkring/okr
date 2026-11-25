import type { ArticleSection } from '@okr/shared-models';

import { findBlock } from './article-editor.util';

/**
 * The undo history of the article editor (spec 1.175 §7.6). Pure and generic: nothing is mutated, and every step
 * keeps the objects it holds, so an undone state is the very object that was recorded.
 */

/** Steps kept in `past`; the oldest are dropped. */
export const HISTORY_MAX = 100;
/** A run of edits with the same tag continues while each record comes within this many ms of the one before. */
export const TYPING_PAUSE = 1000;

export interface EditorHistory<T> {
  past: T[];
  present: T;
  future: T[];
  /** Tag of the last record when it opened or continued a run; undefined when the last action ended one. */
  tag?: string;
  /** Time of the last record, in ms. */
  at?: number;
}

export function createHistory<T>(present: T): EditorHistory<T> {
  return { past: [], present, future: [] };
}

/**
 * Records `next`. A record with the same tag as the last record, and at most TYPING_PAUSE after it, replaces the
 * present instead of adding a step. Any other record adds a step and clears the future. Without a tag it always adds a step.
 */
export function record<T>(h: EditorHistory<T>, next: T, options: { tag?: string; at?: number } = {}): EditorHistory<T> {
  const at = options.at ?? Date.now();
  const tag = options.tag;
  const continuesRun = tag !== undefined && h.tag === tag && h.at !== undefined && at - h.at <= TYPING_PAUSE;
  if (continuesRun) return { ...h, present: next, tag, at };
  const past = [...h.past, h.present].slice(-HISTORY_MAX);
  return { past, present: next, future: [], tag, at };
}

/** Replaces the present without a step. Past, future, tag and at are kept, so a run goes on. */
export function replacePresent<T>(h: EditorHistory<T>, next: T): EditorHistory<T> {
  return { ...h, present: next };
}

export function undo<T>(h: EditorHistory<T>): EditorHistory<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo<T>(h: EditorHistory<T>): EditorHistory<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present].slice(-HISTORY_MAX), present: next, future: rest };
}

export interface ArticleEditorState { section: ArticleSection; selectedId?: string }

/**
 * A step of the editor of an article, or of a Versand mail (its `section` is the one of `mailArticle`). `copiedFrom` (copy → source,
 * `prepareArticleForSave`) goes with it, so that an undone copy leaves none.
 */
export interface EditorState extends ArticleEditorState { copiedFrom: Record<string, string> }

/** Keeps the selection only while the selected block exists (top level or inside a column). */
export function withValidSelection(state: ArticleEditorState): ArticleEditorState {
  if (state.selectedId === undefined) return state;
  const blocks = state.section?.properties?.blocks ?? [];
  if (findBlock(blocks, state.selectedId)) return state;
  return { section: state.section };
}

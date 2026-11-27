import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { MarkType, Node as PMNode, NodeType, ResolvedPos } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list';
import { Command, EditorState, Selection, TextSelection, Transaction } from 'prosemirror-state';

import type { RichTextCaret } from '../rich-text-inline';
import { htmlToDoc } from './rich-text.html';
import { richTextSchema as schema } from './rich-text.schema';

export type MarkName = 'strong' | 'em' | 'u' | 's' | 'sup' | 'sub' | 'code';
export type ColorMarkName = 'text_color' | 'text_background_color';
export type Align = 'left' | 'center' | 'right' | 'justify';
/** 0 = paragraph, 1–6 = heading level */
export type BlockLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The old editor allowed indents up to this level (40px each). */
export const MAX_INDENT = 7;

const COLOR_ATTR: Record<ColorMarkName, string> = { text_color: 'color', text_background_color: 'backgroundColor' };

export { redo, undo };

// ---------------------------------------------------------------- state queries (toolbar)

export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

/** The colour of the colour mark at the cursor, or null. */
export function activeColor(state: EditorState, name: ColorMarkName): string | null {
  const type = schema.marks[name];
  const { $from } = state.selection;
  const mark = type.isInSet(state.storedMarks || $from.marks());
  return mark ? (mark.attrs[COLOR_ATTR[name]] as string) : null;
}

export function activeLink(state: EditorState): string | null {
  return activeLinkInfo(state)?.href ?? null;
}

/** Where a link opens: `_blank` is a new window or tab, null the same one. */
export type LinkTarget = '_blank' | null;

/** The link the link dialog edits: the one around the cursor, or the one the selection lies in. */
export interface LinkInfo {
  href: string;
  target: LinkTarget;
  /** the linked text */
  text: string;
}

export function activeLinkInfo(state: EditorState): LinkInfo | null {
  const type = schema.marks['link'];
  const range = linkRange(state);
  if (!range) return null;
  const mark = type.isInSet(state.doc.nodeAt(range.from)?.marks ?? []);
  if (!mark) return null;
  return {
    href: mark.attrs['href'] as string,
    target: mark.attrs['target'] === '_blank' ? '_blank' : null,
    text: state.doc.textBetween(range.from, range.to),
  };
}

/** The extent of the link the cursor sits in, or the selection lies in completely. */
function linkRange(state: EditorState): { from: number; to: number } | null {
  const type = schema.marks['link'];
  const { from, to, empty, $from } = state.selection;
  if (empty) return markRange(state, type);
  if ($from.parent !== state.selection.$to.parent) return null;
  // a selection starting at the link's first letter: the text right of `from` decides, not the one before
  const range = markRangeAt($from, type, 'after');
  return range && range.from <= from && to <= range.to ? range : null;
}

function parentBlock(state: EditorState): PMNode {
  return state.selection.$from.parent;
}

export function activeBlockLevel(state: EditorState): BlockLevel {
  const block = parentBlock(state);
  return block.type === schema.nodes['heading'] ? (block.attrs['level'] as BlockLevel) : 0;
}

export function activeAlign(state: EditorState): Align {
  return (parentBlock(state).attrs['align'] as Align | null) ?? 'left';
}

/** Is the cursor inside a node of this type (list or blockquote)? */
export function isInside(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === type) return true;
  }
  return false;
}

// ---------------------------------------------------------------- commands

export function toggleMarkCommand(name: MarkName): Command {
  return toggleMark(schema.marks[name]);
}

/** Paragraph or heading; alignment and indent of the block stay. */
export function setBlockLevel(level: BlockLevel): Command {
  return (state, dispatch) => {
    const { align, indent } = parentBlock(state).attrs as { align: string | null; indent: number | null };
    return level === 0
      ? setBlockType(schema.nodes['paragraph'], { align, indent })(state, dispatch)
      : setBlockType(schema.nodes['heading'], { level, align, indent })(state, dispatch);
  };
}

export function toggleList(kind: 'bullet_list' | 'ordered_list'): Command {
  return (state, dispatch) => {
    const type = schema.nodes[kind];
    const other = schema.nodes[kind === 'bullet_list' ? 'ordered_list' : 'bullet_list'];
    if (isInside(state, type)) return liftListItem(schema.nodes['list_item'])(state, dispatch);
    if (isInside(state, other)) {
      // switch the list type in place
      const { $from } = state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === other) {
          if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(depth), type));
          return true;
        }
      }
    }
    return wrapInList(type)(state, dispatch);
  };
}

export function toggleBlockquote(): Command {
  return (state, dispatch) =>
    isInside(state, schema.nodes['blockquote']) ? lift(state, dispatch) : wrapIn(schema.nodes['blockquote'])(state, dispatch);
}

/** Applies an attribute change to every paragraph and heading the selection touches. */
function updateTextblocks(update: (node: PMNode) => Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let changed = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type !== schema.nodes['paragraph'] && node.type !== schema.nodes['heading']) return true;
      const attrs = update(node);
      if (attrs) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
        changed = true;
      }
      return false;
    });
    if (changed && dispatch) dispatch(tr);
    return changed;
  };
}

/** `left` is stored as no alignment, as the old editor did. */
export function setAlign(align: Align): Command {
  return updateTextblocks(() => ({ align: align === 'left' ? null : align }));
}

/** Inside a list, indenting nests the item; elsewhere the block moves by 40px. */
export function indent(delta: 1 | -1): Command {
  return (state, dispatch) => {
    if (isInside(state, schema.nodes['list_item'])) {
      const item = schema.nodes['list_item'];
      return delta > 0 ? sinkListItem(item)(state, dispatch) : liftListItem(item)(state, dispatch);
    }
    return updateTextblocks((node) => {
      const current = (node.attrs['indent'] as number | null) ?? 0;
      const next = Math.min(MAX_INDENT, Math.max(0, current + delta));
      return next === current ? null : { indent: next === 0 ? null : next };
    })(state, dispatch);
  };
}

/** Sets the colour on the selection; null removes it. */
export function setColor(name: ColorMarkName, color: string | null): Command {
  return (state, dispatch) => {
    const type = schema.marks[name];
    const { from, to, empty } = state.selection;
    if (empty) {
      if (dispatch) {
        dispatch(color ? state.tr.addStoredMark(type.create({ [COLOR_ATTR[name]]: color })) : state.tr.removeStoredMark(type));
      }
      return true;
    }
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, type);
      if (color) tr.addMark(from, to, type.create({ [COLOR_ATTR[name]]: color }));
      dispatch(tr);
    }
    return true;
  };
}

export interface LinkOptions {
  /** where the link opens; default a new window */
  target?: LinkTarget;
  /** the linked text; when it differs from the current one, it replaces it (with no selection, default the URL) */
  text?: string;
}

/**
 * Sets or removes a link. With nothing selected, the text (or the URL) is inserted as linked text; with a cursor inside
 * a link, or a selection within one, the whole link is changed.
 */
export function setLink(href: string | null, options: LinkOptions = {}): Command {
  return (state, dispatch) => {
    const type = schema.marks['link'];
    let { from, to } = state.selection;
    const range = linkRange(state);
    if (range) ({ from, to } = range);
    if (from === to && !href) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    const target = options.target === undefined ? '_blank' : options.target;
    const text = options.text?.trim();
    if (from === to || (href && text && text !== state.doc.textBetween(from, to))) {
      // new text: it keeps the marks of its first letter (bold stays bold), the link is set anew
      const label = text || href || '';
      const marks = from === to ? state.selection.$from.marks() : (state.doc.nodeAt(from)?.marks ?? []);
      tr.replaceWith(from, to, schema.text(label, type.removeFromSet(marks)));
      to = from + label.length;
    }
    tr.removeMark(from, to, type);
    if (href) tr.addMark(from, to, type.create({ href, target }));
    if (state.selection.empty || range) tr.setSelection(TextSelection.create(tr.doc, to));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/**
 * The extent of the mark around the cursor, if the cursor sits inside one. A link whose text is partly
 * bold spans several text nodes; adjacent nodes carrying the same mark count as one range.
 */
function markRange(state: EditorState, type: MarkType): { from: number; to: number } | null {
  return markRangeAt(state.selection.$from, type, 'before');
}

/** `side`: at a boundary between two texts, which one counts (before: typing continues a link). */
function markRangeAt($pos: ResolvedPos, type: MarkType, side: 'before' | 'after'): { from: number; to: number } | null {
  const parent = $pos.parent;
  const children: { from: number; to: number; node: PMNode }[] = [];
  parent.forEach((node, offset) => children.push({ from: offset, to: offset + node.nodeSize, node }));
  const offset = $pos.parentOffset;
  const index = side === 'before'
    ? children.findIndex((c) => c.from < offset && offset <= c.to)
    : children.findIndex((c) => c.from <= offset && offset < c.to);
  const mark = index >= 0 ? type.isInSet(children[index].node.marks) : undefined;
  if (!mark) return null;
  const sameMark = (i: number) => i >= 0 && i < children.length && mark.isInSet(children[i].node.marks);
  let first = index;
  let last = index;
  while (sameMark(first - 1)) first--;
  while (sameMark(last + 1)) last++;
  return { from: $pos.start() + children[first].from, to: $pos.start() + children[last].to };
}

// ---------------------------------------------------------------- task items (markdown `- [x]`)

/** Is the cursor in a task item? */
export function inTaskItem(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type === schema.nodes['list_item']) return node.attrs['checked'] !== null;
  }
  return false;
}

/**
 * Turns the list items of the selection into task items (unchecked), or back into ordinary items when the
 * first one already is a task. Outside a list, the paragraph becomes a one-item bullet list first.
 */
export function toggleTaskItem(): Command {
  return (state, dispatch) => {
    const item = schema.nodes['list_item'];
    const markItems = (tr: Transaction, checked: (node: PMNode) => boolean | null): Transaction => {
      const { from, to } = tr.selection;
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type === item) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: checked(node) });
        return true;
      });
      return tr;
    };
    if (!isInside(state, item)) {
      // one transaction (one undo step): wrap into a bullet list, then make its item a task
      return wrapInList(schema.nodes['bullet_list'])(state, dispatch && ((tr) => dispatch(markItems(tr, () => false))));
    }
    const makeTask = !inTaskItem(state);
    if (dispatch) dispatch(markItems(state.tr, (node) => (makeTask ? ((node.attrs['checked'] as boolean | null) ?? false) : null)));
    return true;
  };
}

/** Ticks or unticks the task item at `pos` (the item's own position). */
export function toggleChecked(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node || node.type !== schema.nodes['list_item'] || node.attrs['checked'] === null) return false;
    if (dispatch) dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs['checked'] }));
    return true;
  };
}

/** Enter in a list: the new item of a task list starts unchecked instead of copying the tick. */
export function splitItem(): Command {
  return (state, dispatch) => splitListItem(schema.nodes['list_item'])(state, dispatch && ((tr) => {
    const { $from } = tr.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type === schema.nodes['list_item']) {
        if (node.attrs['checked'] === true) tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, checked: false });
        break;
      }
    }
    dispatch(tr);
  }));
}

export function insertImage(src: string): Command {
  return (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes['image'].create({ src })).scrollIntoView());
    return true;
  };
}

// ---------------------------------------------------------------- texts edited block by block (spec 1.175 §7.5)

/** Is the cursor in an empty last paragraph, with something above it? Not in a list, a quote or a heading. */
export function endsWithEmptyParagraph(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  return empty && $from.depth === 1 && $from.parent.type === schema.nodes['paragraph'] && $from.parent.content.size === 0
    && state.doc.childCount > 1 && $from.index(0) === state.doc.childCount - 1;
}

/** Is the cursor at the start of the first paragraph or heading? Not in a list or a quote, where Backspace lifts the line. */
export function isAtVeryStart(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  return empty && $from.depth === 1 && $from.parent.isTextblock && $from.parentOffset === 0 && $from.index(0) === 0;
}

/** Takes the empty last paragraph away (see `endsWithEmptyParagraph`); the cursor goes to the end of the text above. */
export function removeEmptyLastParagraph(): Command {
  return (state, dispatch) => {
    if (!endsWithEmptyParagraph(state)) return false;
    if (dispatch) {
      const { $from } = state.selection;
      const tr = state.tr.delete($from.before(1), $from.after(1));
      dispatch(tr.setSelection(caretSelection(tr.doc, 'end')));
    }
    return true;
  };
}

/** The cursor for `caret` in `doc`; a text that cannot be found gives the end. */
export function caretSelection(doc: PMNode, caret: RichTextCaret): Selection {
  // a cursor needs a text: a line or a picture block at the end is skipped
  const atEnd = Selection.findFrom(doc.resolve(doc.content.size), -1, true) ?? Selection.atEnd(doc);
  if (caret === 'start') return Selection.findFrom(doc.resolve(0), 1, true) ?? Selection.atStart(doc);
  if (caret === 'end') return atEnd;
  const upper = htmlToDoc(caret.afterHtml);
  // nothing stood above: the lower text begins at the start, whatever it begins with
  if (upper.childCount === 1 && upper.child(0).isTextblock && upper.child(0).content.size === 0) return caretSelection(doc, 'start');
  // the end of its text, not of its last tag: the first paragraph below may have been merged into it
  const upperEnd = Selection.atEnd(upper);
  const pos = upperEnd instanceof TextSelection ? upperEnd.head : upper.content.size;
  const differs = doc.content.findDiffStart(upper.content);
  if (differs !== null && differs < pos) return atEnd;
  return Selection.findFrom(doc.resolve(pos), 1, true) ?? atEnd;
}

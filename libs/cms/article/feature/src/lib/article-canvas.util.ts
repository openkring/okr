import {
  ARTICLE_PROFILE, allowedTypesAt, blocksInOrder, createBlock, findBlock, insertBlock, moveBlock,
  type ArticlePreviewDevice, type BlockPlace, type EditorProfile, type NewId,
} from '@okr/cms-section-util';
import type { ArticleBlock, MailBlock, MailBlockType } from '@okr/shared-models';
import type { RichTextCaret } from '@okr/shared-ui-editor';

/** What the author did in the canvas of an article, or of a mail. The host applies every change at once (`article-canvas.ts`). */
export interface CanvasChange<B extends MailBlock = ArticleBlock> {
  blocks: B[];
  /** the selected block from now on; undefined = nothing */
  selectedId?: string;
  /** 'text:<id>' while typing in that block; without it the change is a step of its own */
  tag?: string;
  /** old id → new id. Duplicated: source → copy, inner blocks included. Joined: the text that is gone → the text above */
  copies?: Record<string, string>;
  /** where the cursor goes in the text `selectedId` */
  caret?: RichTextCaret;
}

interface DropData { id?: string; newType?: MailBlockType }

/** A dragged block (`id`) or entry of the library (`newType`) dropped at `target`; undefined when that changes nothing. */
export function dropChange(blocks: ArticleBlock[], data: DropData, target: BlockPlace, newId: NewId, profile?: EditorProfile): CanvasChange | undefined;
export function dropChange(blocks: MailBlock[], data: DropData, target: BlockPlace, newId: NewId, profile?: EditorProfile): CanvasChange<MailBlock> | undefined;
export function dropChange(blocks: MailBlock[], data: DropData, target: BlockPlace, newId: NewId, profile: EditorProfile = ARTICLE_PROFILE): CanvasChange<MailBlock> | undefined {
  const { id, newType } = data;
  if (newType !== undefined) {
    if (!profile.types.includes(newType)) return undefined;
    const block = createBlock(newType, newId);
    const next = insertBlock(blocks, block, target);
    return next === blocks ? undefined : { blocks: next, selectedId: block.id };
  }
  if (id === undefined) return undefined;
  const next = moveBlock(blocks, id, target);
  return next === blocks ? undefined : { blocks: next, selectedId: id };
}

/** The columns block around an inner block. */
export function parentId(blocks: MailBlock[], id: string): string | undefined {
  return findBlock(blocks, id)?.place.columnsId;
}

/**
 * Whether a list accepts what is dragged. `full`: the article has as many blocks as it may have, so nothing new and nothing out of
 * a column gets onto its top level (the blocks of columns do not count).
 */
export function canDropAt(
  data: { type: MailBlockType; isNew?: boolean; isColumnsChild?: boolean }, place: Pick<BlockPlace, 'columnsId'>, full = false, profile: EditorProfile = ARTICLE_PROFILE,
): boolean {
  if (place.columnsId !== undefined) return allowedTypesAt(place, profile).includes(data.type);
  // what stands there can be moved, also when this editor does not know it
  if (data.isNew && !profile.types.includes(data.type)) return false;
  return !full || !(data.isNew || data.isColumnsChild);
}

// ------------------------------------------------------- blocks --------------------------------------------------------

export type CanvasItemKind = 'block' | 'columns' | 'unknown';

/** 'unknown': not of this app or profile, or not in a column; readers do not see it. */
export function kindOf(block: MailBlock, inColumn: boolean, profile: EditorProfile = ARTICLE_PROFILE): CanvasItemKind {
  if (!allowedTypesAt(inColumn ? { columnsId: '' } : {}, profile).includes(block.type)) return 'unknown';
  return block.type === 'columns' ? 'columns' : 'block';
}

/** A block whose text is edited in place. */
export function isTextual(block: MailBlock): block is Extract<MailBlock, { html: string }> {
  return block.type === 'text' || block.type === 'callout';
}

/** The block that gets the focus when this one is removed. */
export function neighbourId(blocks: MailBlock[], id: string): string | undefined {
  const place = findBlock(blocks, id)?.place;
  if (!place) return undefined;
  const list = blocksInOrder(blocks).filter((block) => {
    const at = findBlock(blocks, block.id)?.place;
    return at?.columnsId === place.columnsId && at?.column === place.column;
  });
  const at = list.findIndex((block) => block.id === id);
  return (list[at + 1] ?? list[at - 1])?.id ?? place.columnsId;
}

/** Drawn by readers as a classic article of only a text, also with a button under it (design §8). `free`: isFreeArticle. */
export function isClassicText(blocks: MailBlock[], free: boolean): boolean {
  const [first, second, third] = blocks;
  if (first?.type !== 'text' || (first.align ?? 'left') !== 'left') return false;
  return second === undefined || (second.type === 'button' && third === undefined && !free);
}

/** The button of a classic article; readers see it under the grid, not in it. */
export function classicButtonId(blocks: MailBlock[], free: boolean): string | undefined {
  const last = blocks.at(-1);
  return last?.type === 'button' && !free ? last.id : undefined;
}

// ------------------------------------------------------- the page ------------------------------------------------------

/**
 * How wide the page in the canvas is, in px (§7.2). An article on the desktop takes the room it gets, at most the width. 'auto' (a phone): an
 * article takes all the room; a mail, which does not follow the viewport, is never wider than its mobile view, so that its columns stack.
 */
export function canvasSize(device: ArticlePreviewDevice, profile: EditorProfile): { width?: number; maxWidth?: number } {
  const isMail = profile.kind === 'mail';
  if (device === 'auto') return isMail ? { maxWidth: profile.width.mobile } : {};
  const width = profile.width[device];
  return device === 'desktop' && !isMail ? { maxWidth: width } : { width };
}

// ------------------------------------------------------- dragging ------------------------------------------------------

/** What a list is asked for: a block of the canvas, or a new one of the library. */
export interface DraggedType { type?: MailBlockType; isNew?: boolean; isColumnsChild?: boolean }

/**
 * Whether a drop list takes what is dragged over it (`cdkDropListEnterPredicate`). The CDK does not count the list a block comes from
 * among its candidates, so the top level around it would take the block while it is still over its own column. `switching`: between
 * leaving one list and entering the next the CDK asks whether a list can receive at all, not whether the pointer is over it.
 */
export function mayEnterList(
  { type, isNew, isColumnsChild }: DraggedType, place: Pick<BlockPlace, 'columnsId'>, state: { full: boolean; switching: boolean; isOverOwnColumn: () => boolean },
  profile: EditorProfile = ARTICLE_PROFILE,
): boolean {
  if (!type || !canDropAt({ type, isNew, isColumnsChild }, place, state.full, profile)) return false;
  return place.columnsId !== undefined || !isColumnsChild || state.switching || !state.isOverOwnColumn();
}

/** The point starts at most this far below the upper edge of the block, … */
const DRAG_INSIDE = 30;
/** … stays with the block while the pointer moves this far, … */
const DRAG_NEAR = 24;
/** … and has come to the pointer after this much more. */
const DRAG_MEET = 72;

/**
 * The point that counts in a drag (`cdkDragConstrainPosition`). The handle stands above its block, over the one before: without this,
 * a block that is hardly moved would already change places with that one. So the point starts inside the block and comes to the pointer
 * while that moves away. `start`: where the drag began; `block`: the block's box then.
 */
export function dragPoint(start: CanvasPoint, pointer: CanvasPoint, block: { top: number; height: number }): CanvasPoint {
  const above = Math.max(0, block.top + Math.min(block.height / 2, DRAG_INSIDE) - start.y);
  const moved = Math.hypot(pointer.x - start.x, pointer.y - start.y);
  return { x: pointer.x, y: pointer.y + above * Math.min(1, Math.max(0, 1 - (moved - DRAG_NEAR) / DRAG_MEET)) };
}

export interface CanvasPoint { x: number; y: number }

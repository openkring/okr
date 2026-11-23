import { allowedTypesAt, createBlock, findBlock, insertBlock, moveBlock, type BlockPlace, type NewId } from '@okr/cms-section-util';
import { ARTICLE_BLOCK_TYPES, type ArticleBlock, type ArticleBlockType } from '@okr/shared-models';
import type { RichTextCaret } from '@okr/shared-ui-editor';

/** What the author did in the canvas. The host applies every change at once (`article-canvas.ts`). */
export interface CanvasChange {
  blocks: ArticleBlock[];
  /** the selected block from now on; undefined = nothing */
  selectedId?: string;
  /** 'text:<id>' while typing in that block; without it the change is a step of its own */
  tag?: string;
  /** old id → new id. Duplicated: source → copy, inner blocks included. Joined: the text that is gone → the text above */
  copies?: Record<string, string>;
  /** where the cursor goes in the text `selectedId` */
  caret?: RichTextCaret;
}

/** A dragged block (`id`) or entry of the library (`newType`) dropped at `target`; undefined when that changes nothing. */
export function dropChange(
  blocks: ArticleBlock[], data: { id?: string; newType?: ArticleBlockType }, target: BlockPlace, newId: NewId,
): CanvasChange | undefined {
  const { id, newType } = data;
  if (newType !== undefined) {
    if (!ARTICLE_BLOCK_TYPES.includes(newType)) return undefined;
    const block = createBlock(newType, newId);
    const next = insertBlock(blocks, block, target);
    return next === blocks ? undefined : { blocks: next, selectedId: block.id };
  }
  if (id === undefined) return undefined;
  const next = moveBlock(blocks, id, target);
  return next === blocks ? undefined : { blocks: next, selectedId: id };
}

/** The columns block around an inner block. */
export function parentId(blocks: ArticleBlock[], id: string): string | undefined {
  return findBlock(blocks, id)?.place.columnsId;
}

/**
 * Whether a list accepts what is dragged. `full`: the article has as many blocks as it may have, so nothing new and nothing out of
 * a column gets onto its top level (the blocks of columns do not count).
 */
export function canDropAt(
  data: { type: ArticleBlockType; isNew?: boolean; isColumnsChild?: boolean }, place: Pick<BlockPlace, 'columnsId'>, full = false,
): boolean {
  if (place.columnsId !== undefined) return allowedTypesAt(place).includes(data.type);
  return !full || !(data.isNew || data.isColumnsChild);
}

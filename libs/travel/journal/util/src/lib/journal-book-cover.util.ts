import { JournalBookModel } from '@okr/shared-models';
import { Box, MARGIN, PAGE_H, PAGE_W } from './journal-book-layout.util';
import { BookFrame, DEFAULT_BLEED_MM, escapeHtml, MAP_BACK, stripEmoji } from './journal-book.util';

/** Below this spine width the spine carries no title. */
export const SPINE_TITLE_MIN_MM = 6;
const BACK_MAP_W = 120;
const BACK_MAP_H = 85;

/**
 * The cover sheet (design §5.4), mm from its top-left corner. Left to right: wrap, bleed, back (297), spine,
 * front (297), bleed, wrap — width 2 × (297 + bleed) + spine + 2 × wrap, height 210 + 2 × (bleed + wrap).
 * Front: the cover photo (full bleed incl. wrap) + title + period; spine: the title rotated (spine ≥ 6 mm); back:
 * black with a small route map. Undefined when no cover is ordered. Pass `BookLayout.title`, `.period` and
 * `.coverImageKey` (the resolved default, coverImageKeyOf) — `book.coverImageKey` itself is not read here.
 */
export function coverLayout(book: JournalBookModel, title: string, period: string, coverImageKey: string | undefined):
  { width: number; height: number; frames: BookFrame[] } | undefined {
  const print = book.print;
  if (!print || print.cover === 'none') return undefined;
  const bleed = print.bleedMm ?? DEFAULT_BLEED_MM;
  const spine = print.spineMm ?? 0;
  const wrap = print.wrapMm ?? 0;
  const edge = wrap + bleed; // from the sheet edge to the trim
  const width = 2 * (PAGE_W + bleed) + spine + 2 * wrap;
  const height = PAGE_H + 2 * edge;
  const backX = edge;
  const spineX = backX + PAGE_W;
  const frontX = spineX + spine;
  const frames: BookFrame[] = [];
  if (coverImageKey) {
    frames.push({ kind: 'photo', box: { x: frontX, y: 0, w: width - frontX, h: height }, imageKey: coverImageKey, fit: 'fill' });
  }
  const textW = PAGE_W - 2 * MARGIN;
  const t = escapeHtml(stripEmoji(title));
  frames.push({ kind: 'text', box: { x: frontX + MARGIN, y: edge + MARGIN, w: textW, h: 30 }, html: `<p>${t}</p>`, style: 'title' });
  if (period) frames.push({ kind: 'text', box: { x: frontX + MARGIN, y: edge + MARGIN + 32, w: textW, h: 10 }, html: `<p>${escapeHtml(period)}</p>`, style: 'facts' });
  if (spine >= SPINE_TITLE_MIN_MM) {
    frames.push({ kind: 'text', box: { x: spineX, y: edge + MARGIN, w: spine, h: PAGE_H - 2 * MARGIN }, html: `<p>${t}</p>`, style: 'title', rotate: 90 });
  }
  const map: Box = { x: backX + (PAGE_W - BACK_MAP_W) / 2, y: edge + (PAGE_H - BACK_MAP_H) / 2, w: BACK_MAP_W, h: BACK_MAP_H };
  frames.push({ kind: 'map', box: map, file: MAP_BACK });
  return { width, height, frames };
}

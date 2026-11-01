/** An axis-aligned box: x/y top left, w/h size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The part of a `srcW`×`srcH` camera frame that is visible in a `viewW`×`viewH` view showing it with
 * `object-fit: cover`, magnified `zoom` times around the centre (the Lupe's digital zoom; 1 for lens
 * zoom). In frame pixels. Recognising only this part saves work and makes the digital zoom help.
 */
export function visibleRect(srcW: number, srcH: number, viewW: number, viewH: number, zoom = 1): Rect {
  if (srcW <= 0 || srcH <= 0 || viewW <= 0 || viewH <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.max(viewW / srcW, viewH / srcH) * Math.max(zoom, 1);
  const w = Math.min(srcW, viewW / scale);
  const h = Math.min(srcH, viewH / scale);
  return { x: (srcW - w) / 2, y: (srcH - h) / 2, w, h };
}

/** A box found in a crop of `crop.w`×`crop.h` frame pixels, placed in the `viewW`×`viewH` view. */
export function toView(box: Rect, crop: Rect, viewW: number, viewH: number): Rect {
  const sx = crop.w > 0 ? viewW / crop.w : 0;
  const sy = crop.h > 0 ? viewH / crop.h : 0;
  return { x: box.x * sx, y: box.y * sy, w: box.w * sx, h: box.h * sy };
}

/** Recognised text cleaned for translating: hyphenated line breaks joined, whitespace collapsed. */
export function cleanOcrText(text: string): string {
  return text.replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2').replace(/\s+/g, ' ').trim();
}

/**
 * Whether a recognised block is worth translating: enough confidence and at least two letters
 * (Tesseract reads noise as `|`, `—`, single characters).
 */
export function isReadableBlock(text: string, confidence: number, minConfidence = 60): boolean {
  if (confidence < minConfidence) return false;
  return (text.match(/\p{L}/gu) ?? []).length >= 2;
}

/** Longest text the live view sends per call and how many blocks at most (`translateMany`). */
export const LIVE_MAX_BLOCKS = 20;
export const LIVE_MAX_CHARS = 2000;

/**
 * The texts of this frame that have no translation yet, without duplicates, cut to what one
 * `translateMany` call accepts. Texts already known stay out (they are shown from the memo).
 */
export function pendingTexts(texts: string[], known: ReadonlySet<string>): string[] {
  const out: string[] = [];
  let chars = 0;
  for (const t of new Set(texts)) {
    if (known.has(t)) continue;
    if (out.length >= LIVE_MAX_BLOCKS || chars + t.length > LIVE_MAX_CHARS) break;
    out.push(t);
    chars += t.length;
  }
  return out;
}

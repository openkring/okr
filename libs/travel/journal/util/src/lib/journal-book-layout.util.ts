import { BookPageOverride, BookTemplate } from '@okr/shared-models';
import { ImageView } from './journal-view.util';

/** Page geometry in mm (A4 landscape), origin = top-left of the trim box. */
export const PAGE_W = 297;
export const PAGE_H = 210;
export const MARGIN = 12;
export const GAP = 4;
export const DPI_OK = 300;
export const DPI_POOR = 200;
/** Smallest print size that still fills a full-bleed page (303 x 216 mm) at 300 dpi. */
export const PRINT_FILL_LONG_PX = 3579;
export const PRINT_FILL_SHORT_PX = 2551;
const MM_PER_INCH = 25.4;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Scale factor (<= 1) to bring a photo down to the smallest size that still fills a full-bleed page at 300 dpi. */
export function printScale(width: number, height: number): number {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long <= 0 || short <= 0) return 1;
  return Math.min(1, Math.max(PRINT_FILL_LONG_PX / long, PRINT_FILL_SHORT_PX / short));
}

/** The photo frames of a template, in mm. `full` covers trim + bleed; all others stay inside the margins. */
export function templateBoxes(template: BookTemplate, bleedMm: number): Box[] {
  const cw = PAGE_W - 2 * MARGIN;
  const ch = PAGE_H - 2 * MARGIN;
  switch (template) {
    case 'full':
      return [{ x: -bleedMm, y: -bleedMm, w: PAGE_W + 2 * bleedMm, h: PAGE_H + 2 * bleedMm }];
    case 'two-portrait':
    case 'two-landscape': {
      const w = (cw - GAP) / 2;
      return [
        { x: MARGIN, y: MARGIN, w, h: ch },
        { x: MARGIN + w + GAP, y: MARGIN, w, h: ch },
      ];
    }
    case 'hero-2': {
      const heroW = (cw - GAP) * 0.6;
      const sideW = cw - GAP - heroW;
      const sideH = (ch - GAP) / 2;
      return [
        { x: MARGIN, y: MARGIN, w: heroW, h: ch },
        { x: MARGIN + heroW + GAP, y: MARGIN, w: sideW, h: sideH },
        { x: MARGIN + heroW + GAP, y: MARGIN + sideH + GAP, w: sideW, h: sideH },
      ];
    }
    case 'hero-3': {
      const heroH = (ch - GAP) * 0.65;
      const rowH = ch - GAP - heroH;
      const w = (cw - 2 * GAP) / 3;
      return [
        { x: MARGIN, y: MARGIN, w: cw, h: heroH },
        ...[0, 1, 2].map((i) => ({ x: MARGIN + i * (w + GAP), y: MARGIN + heroH + GAP, w, h: rowH })),
      ];
    }
  }
}

function isLandscape(i: ImageView): boolean {
  return i.width >= i.height;
}

/** Deterministic greedy pagination: first match of hero-3, hero-2, two-portrait, two-landscape, full. */
export function autoLayout(images: ImageView[]): BookPageOverride[] {
  const pages: BookPageOverride[] = [];
  let i = 0;
  while (i < images.length) {
    const rest = images.length - i;
    const first = images[i];
    const second = images[i + 1];
    let template: BookTemplate;
    let take: number;
    if (isLandscape(first) && rest >= 4) {
      template = 'hero-3';
      take = 4;
    } else if (isLandscape(first) && rest >= 3) {
      template = 'hero-2';
      take = 3;
    } else if (second && !isLandscape(first) && !isLandscape(second)) {
      template = 'two-portrait';
      take = 2;
    } else if (second && isLandscape(first) && isLandscape(second)) {
      template = 'two-landscape';
      take = 2;
    } else {
      template = 'full';
      take = 1;
    }
    pages.push({ template, imageKeys: images.slice(i, i + take).map((x) => x.key) });
    i += take;
  }
  return pages;
}

/**
 * The pages of an album: hand-set overrides first (unknown and hidden images and empty pages dropped),
 * then the images the overrides do not mention, laid out automatically.
 */
export function albumPages(images: ImageView[], override: BookPageOverride[] | undefined, hidden: Set<string>): BookPageOverride[] {
  const visible = images.filter((i) => !hidden.has(i.key));
  const known = new Set(visible.map((i) => i.key));
  const used = new Set<string>();
  const pages: BookPageOverride[] = [];
  for (const p of override ?? []) {
    const keys = p.imageKeys.filter((k) => known.has(k) && !used.has(k));
    keys.forEach((k) => used.add(k));
    if (keys.length > 0) pages.push({ template: p.template, imageKeys: keys });
  }
  return [...pages, ...autoLayout(visible.filter((i) => !used.has(i.key)))];
}

/** Effective print resolution of a photo in a frame. fill = covers the box (cropped), whole = contained (limiting side). */
export function effectiveDpi(px: { width: number; height: number }, box: Box, fit: 'fill' | 'whole'): number {
  const dpiW = (px.width * MM_PER_INCH) / box.w;
  const dpiH = (px.height * MM_PER_INCH) / box.h;
  return fit === 'fill' ? Math.min(dpiW, dpiH) : Math.max(dpiW, dpiH);
}

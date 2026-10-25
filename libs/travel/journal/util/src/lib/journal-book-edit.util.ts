import { BookPageOverride, BookTemplate, JournalBookModel } from '@okr/shared-models';

import { templateBoxes } from './journal-book-layout.util';
import { BookLayout } from './journal-book.util';
import { ImageView } from './journal-view.util';

/**
 * Editing the book page by page (design 2026-10-24 §5.1): pure helpers that turn an edit into the new override list
 * of an album block (`albums[blockKey].pages`), plus the preview's spreads and the «Fotos fehlen» count.
 * Photos move only between the pages of the same album block (design §3).
 */
export const BOOK_TEMPLATES: BookTemplate[] = ['full', 'two-portrait', 'two-landscape', 'hero-2', 'hero-3'];

/** Number of photo slots of a template. */
export const slotCount = (template: BookTemplate): number => templateBoxes(template, 0).length;

/** The photo pages of an album block as they are laid out now (hero page excluded), as an override list. */
export function blockPagesOf(layout: BookLayout, blockKey: string): BookPageOverride[] {
  return layout.pages
    .filter((p) => p.role === 'photos' && p.blockKey === blockKey && p.template)
    .map((p) => ({ template: p.template as BookTemplate, imageKeys: p.frames.flatMap((f) => (f.kind === 'photo' ? [f.imageKey] : [])) }));
}

/** The template that suits a page of these photos: one → full, two → by orientation, three → hero-2, more → hero-3. */
export function templateFor(images: Pick<ImageView, 'width' | 'height'>[]): BookTemplate {
  if (images.length <= 1) return 'full';
  if (images.length === 2) return images.every((i) => i.width < i.height) ? 'two-portrait' : 'two-landscape';
  return images.length === 3 ? 'hero-2' : 'hero-3';
}

/**
 * Page `index` gets `template`; it takes as many photos as the template has slots, starting at its own first photo
 * (borrowing from the following pages). The following pages keep their templates and are filled again in order;
 * photos left over are appended by the automatic layout.
 */
export function withTemplate(pages: BookPageOverride[], index: number, template: BookTemplate): BookPageOverride[] {
  if (index < 0 || index >= pages.length) return pages;
  const keys = pages.flatMap((p) => p.imageKeys);
  let i = pages.slice(0, index).reduce((n, p) => n + p.imageKeys.length, 0);
  const out = pages.slice(0, index).map((p) => ({ ...p, imageKeys: [...p.imageKeys] }));
  const take = (t: BookTemplate) => {
    const n = slotCount(t);
    out.push({ template: t, imageKeys: keys.slice(i, i + n) });
    i += n;
  };
  take(template);
  for (const p of pages.slice(index + 1)) {
    if (i >= keys.length) break;
    take(p.template);
  }
  return out.filter((p) => p.imageKeys.length > 0);
}

/** How many photos page `index` could take: its own plus those of all following pages of the block. */
export function photosFrom(pages: BookPageOverride[], index: number): number {
  return pages.slice(Math.max(0, index)).reduce((n, p) => n + p.imageKeys.length, 0);
}

/**
 * Moves a photo to page `toIndex` of the same block (appended there). Both pages get the template that suits their
 * new photo count; a page left without photos is dropped.
 */
export function movePhotoTo(pages: BookPageOverride[], imageKey: string, toIndex: number, images: Map<string, ImageView>): BookPageOverride[] {
  const from = pages.findIndex((p) => p.imageKeys.includes(imageKey));
  if (from < 0 || from === toIndex || toIndex < 0 || toIndex >= pages.length) return pages;
  const out = pages.map((p) => ({ ...p, imageKeys: p.imageKeys.filter((k) => k !== imageKey) }));
  out[toIndex].imageKeys.push(imageKey);
  for (const idx of [from, toIndex]) {
    const views = out[idx].imageKeys.map((k) => images.get(k) ?? { width: 3, height: 2 });
    out[idx].template = templateFor(views);
  }
  return out.filter((p) => p.imageKeys.length > 0);
}

/** Spreads of the preview: the first page alone on the right (undefined = empty left side), then pairs. */
export function spreadsOf(pageCount: number): (number | undefined)[][] {
  if (pageCount === 0) return [];
  const spreads: (number | undefined)[][] = [[undefined, 0]];
  for (let i = 1; i < pageCount; i += 2) spreads.push(i + 1 < pageCount ? [i, i + 1] : [i, undefined]);
  return spreads;
}

/**
 * Photos printed in the book (photo frames and the cover) whose print photo is not uploaded yet, counted by the
 * person who took them (the image's author, whose iPad holds the original). Unknown images count under ''.
 */
export function missingPrintsByAuthor(layout: BookLayout, book: JournalBookModel, images: Map<string, ImageView>): Map<string, number> {
  const keys = new Set(layout.pages.flatMap((p) => p.frames).flatMap((f) => (f.kind === 'photo' ? [f.imageKey] : [])));
  if (layout.coverImageKey && book.print?.cover && book.print.cover !== 'none') keys.add(layout.coverImageKey);
  const out = new Map<string, number>();
  for (const key of keys) {
    if (book.prints?.[key]) continue;
    const author = images.get(key)?.authorKey ?? '';
    out.set(author, (out.get(author) ?? 0) + 1);
  }
  return out;
}

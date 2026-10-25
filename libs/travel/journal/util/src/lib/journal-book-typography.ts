import type { TextStyle } from './journal-book.util';

/**
 * The typography of the book's text frames, one set for both renderers: the PDF writer
 * (apps/functions/src/journal/book-pdf.ts, `STYLES`, which mirrors these values today and may import them later) and the
 * browser preview with its DOM pagination. Sizes and gaps in pt, leading as a factor of the line's font size.
 *
 * Fonts: `serif*` = IBM Plex Serif Regular / Italic / Bold, `sans` = Inter Tight SemiBold — the same TTF files in
 * both (apps/functions/src/assets/book, copied into the app's assets/book), so the measured widths agree.
 * Inside a frame: headings (`h1`–`h6`, `book-heading`) and the util's classes (`book-number`, `book-author`,
 * `book-likes`) are set in the sans; headings at HEADING_SCALE, author and likes at SMALL_SCALE; list items are
 * indented by LIST_INDENT_EM of the style's size; `<em>` inside an italic style turns roman.
 */
export type BookFont = 'serif' | 'serifItalic' | 'serifBold' | 'sans';

export interface BookTextStyle {
  font: BookFont;
  size: number; // pt
  leading: number; // line height = size × leading
  color: string;
  gap: number; // pt after each paragraph
}

export const BOOK_WHITE = '#ffffff';
export const BOOK_LIGHT = '#d9d9d9';
export const BOOK_GREY = '#a6a6a6';
export const BOOK_HEADING_SCALE = 1.1;
export const BOOK_SMALL_SCALE = 0.9;
export const BOOK_LIST_INDENT_EM = 1.4;

export const BOOK_TEXT_STYLES: Record<TextStyle, BookTextStyle> = {
  title: { font: 'serifBold', size: 26, leading: 1.15, color: BOOK_WHITE, gap: 4 },
  facts: { font: 'serif', size: 11, leading: 1.35, color: BOOK_LIGHT, gap: 1 },
  stats: { font: 'serif', size: 11, leading: 1.35, color: BOOK_LIGHT, gap: 1 },
  body: { font: 'serif', size: 11, leading: 1.45, color: BOOK_WHITE, gap: 6 },
  author: { font: 'sans', size: 10, leading: 1.4, color: BOOK_GREY, gap: 4 },
  comment: { font: 'serifItalic', size: 11, leading: 1.45, color: BOOK_WHITE, gap: 6 },
};

/** The font files of the four faces (assets/book in the app, assets/book next to the function bundle). */
export const BOOK_FONT_FILES: Record<BookFont, string> = {
  serif: 'IBMPlexSerif-Regular.ttf',
  serifItalic: 'IBMPlexSerif-Italic.ttf',
  serifBold: 'IBMPlexSerif-Bold.ttf',
  sans: 'InterTight-SemiBold.ttf',
};

import { BOOK_FONT_FILES, BOOK_GREY, BOOK_HEADING_SCALE, BOOK_LIST_INDENT_EM, BOOK_SMALL_SCALE, BOOK_TEXT_STYLES, BookFont, TextStyle } from '@okr/travel-journal-util';

/**
 * The CSS of the book's text frames in the browser (preview and the hidden measuring box of the DOM pagination), built
 * from the same constants as the PDF (BOOK_TEXT_STYLES) and set in the same TTF files (assets/book, copied from
 * apps/functions/src/assets/book by the app build). Installed once as a global stylesheet: the frames' HTML is
 * inserted with innerHTML, which component styles do not reach.
 *
 * Frame elements carry `okr-book-text okr-book-style-<style>`; sizes are pt, so a page drawn at its natural size in mm
 * (297 × 210 mm, then scaled with a transform) breaks lines exactly where the measuring box does.
 */
const STYLE_ID = 'okr-book-text-styles';
const FONT_BASE = 'assets/book/';
const SERIF = 'OkrBookSerif';
const SANS = 'OkrBookSans';

interface Face { family: string; weight: number; style: 'normal' | 'italic' }
const FACES: Record<BookFont, Face> = {
  serif: { family: SERIF, weight: 400, style: 'normal' },
  serifItalic: { family: SERIF, weight: 400, style: 'italic' },
  serifBold: { family: SERIF, weight: 700, style: 'normal' },
  sans: { family: SANS, weight: 600, style: 'normal' },
};

const fontCss = (font: BookFont): string => {
  const f = FACES[font];
  return `font-family: '${f.family}', serif; font-weight: ${f.weight}; font-style: ${f.style};`;
};

function bookCss(): string {
  const faces = (Object.keys(FACES) as BookFont[]).map((k) => {
    const f = FACES[k];
    return `@font-face { font-family: '${f.family}'; src: url('${FONT_BASE}${BOOK_FONT_FILES[k]}') format('truetype'); font-weight: ${f.weight}; font-style: ${f.style}; font-display: block; }`;
  });
  const styles = (Object.keys(BOOK_TEXT_STYLES) as TextStyle[]).map((s) => {
    const st = BOOK_TEXT_STYLES[s];
    const gap = `${st.gap}pt`;
    return [
      `.okr-book-style-${s} { ${fontCss(st.font)} font-size: ${st.size}pt; line-height: ${st.leading}; color: ${st.color}; }`,
      `.okr-book-style-${s} p, .okr-book-style-${s} li, .okr-book-style-${s} h1, .okr-book-style-${s} h2, .okr-book-style-${s} h3,`
        + ` .okr-book-style-${s} h4, .okr-book-style-${s} h5, .okr-book-style-${s} h6, .okr-book-style-${s} blockquote, .okr-book-style-${s} pre`
        + ` { margin: 0 0 ${gap} 0; }`,
    ].join('\n');
  });
  const sans = fontCss('sans');
  return [
    ...faces,
    '.okr-book-text { box-sizing: border-box; margin: 0; padding: 0; overflow-wrap: anywhere; font-synthesis: none; font-kerning: normal; text-rendering: geometricPrecision; }',
    ...styles,
    `.okr-book-text ul, .okr-book-text ol { margin: 0; padding: 0 0 0 ${BOOK_LIST_INDENT_EM}em; }`,
    '.okr-book-text li > p { margin: 0; }',
    '.okr-book-text li.book-cont { list-style: none; }',
    '.okr-book-text pre { white-space: pre-wrap; font: inherit; }',
    '.okr-book-text b, .okr-book-text strong { font-weight: 700; }',
    '.okr-book-text em, .okr-book-text i { font-style: italic; }',
    '.okr-book-style-comment em, .okr-book-style-comment i { font-style: normal; }',
    `.okr-book-text h1, .okr-book-text h2, .okr-book-text h3, .okr-book-text h4, .okr-book-text h5, .okr-book-text h6, .okr-book-text .book-heading { ${sans} font-size: ${BOOK_HEADING_SCALE}em; }`,
    `.okr-book-text .book-number, .okr-book-text .book-author, .okr-book-text .book-likes { ${sans} }`,
    `.okr-book-text .book-number { color: ${BOOK_GREY}; }`,
    `.okr-book-text .book-author { color: ${BOOK_GREY}; font-size: ${BOOK_SMALL_SCALE}em; }`,
    `.okr-book-text .book-likes { font-size: ${BOOK_SMALL_SCALE}em; }`,
  ].join('\n');
}

/** Installs the book's fonts and text styles once per document. */
export function ensureBookStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = bookCss();
  document.head.appendChild(style);
}

/** Resolves once the four faces are loaded (or failed — then the fallback font is measured, as it is shown). */
export async function bookFontsReady(): Promise<void> {
  ensureBookStyles();
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all((Object.values(FACES)).map((f) => document.fonts.load(`${f.style} ${f.weight} 11pt '${f.family}'`).catch(() => [])));
}

/** The CSS classes of a text frame. */
export const bookTextClass = (style: TextStyle): string => `okr-book-text okr-book-style-${style}`;

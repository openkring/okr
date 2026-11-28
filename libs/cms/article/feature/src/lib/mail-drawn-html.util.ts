// libs/cms/article/feature/src/lib/mail-drawn-html.util.ts

/** The deepest indent the editor writes (`safeIndent` of the rich-text schema). */
export const MAX_DRAWN_INDENT = 20;

/**
 * A colour <font color> reads: a hex value (the palette of the toolbar) or a plain name. An rgb() pasted from elsewhere is not
 * read by it; such a span keeps its colour in the mail (the renderer keeps the style), only the drawing shows it without.
 */
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{3,20})$/i;

/**
 * The html of a mail's text as the canvas draws it while it is not edited. Angular's sanitizer drops every `style`, so the text
 * colour and the indent that the mail keeps (the renderer writes them inline) would be lost in the drawing. They are moved to
 * what the sanitizer keeps: a colour span becomes `<font color>`, an indented paragraph, heading or quote gets the class
 * `rte-indent-<n>` (`.page.mail` sets its margin). Everything else is left as it is; the sanitizer still runs over the result.
 */
export function mailDrawnHtml(html: string): string {
  if (!html || (!html.includes('color') && !html.includes('data-indent'))) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const span of Array.from(doc.body.querySelectorAll<HTMLElement>('span[style]'))) {
    // the value as written: the browser would hand `style.color` back as rgb(), which <font color> does not read
    const declarations = (span.getAttribute('style') ?? '').split(';').map((d) => d.trim()).filter((d) => d !== '');
    const colorAt = declarations.findIndex((d) => /^color\s*:/i.test(d));
    const color = colorAt < 0 ? '' : declarations[colorAt].slice(declarations[colorAt].indexOf(':') + 1).trim();
    if (!color || !COLOR.test(color)) continue;
    const font = doc.createElement('font');
    font.setAttribute('color', color);
    const rest = declarations.filter((_, i) => i !== colorAt);
    // what else the span holds (a background colour) stays on it, inside the font
    if (rest.length > 0) {
      span.setAttribute('style', `${rest.join(';')};`);
      span.replaceWith(font);
      font.appendChild(span);
    } else {
      font.append(...Array.from(span.childNodes));
      span.replaceWith(font);
    }
  }
  for (const element of Array.from(doc.body.querySelectorAll<HTMLElement>('[data-indent]'))) {
    const indent = parseInt(element.getAttribute('data-indent') ?? '', 10);
    if (Number.isInteger(indent) && indent > 0 && indent <= MAX_DRAWN_INDENT) element.classList.add(`rte-indent-${indent}`);
  }
  return doc.body.innerHTML;
}

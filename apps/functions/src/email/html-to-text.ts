// apps/functions/src/email/html-to-text.ts
// Plain-text twin of an HTML mail body. Deliberately small: the editor produces paragraphs, lists,
// links and images, nothing else needs to survive.

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decodes the entities the editor and Handlebars emit. `&amp;` goes last so `&amp;lt;` stays `&lt;`. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(nbsp|lt|gt|quot|apos);/gi, (_, name: string) => NAMED_ENTITIES[name.toLowerCase()])
    .replace(/&amp;/gi, '&');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi, (_, _q: string, href: string, inner: string) => {
      const label = stripTags(inner).trim();
      if (!label) return href;
      return decodeEntities(label) === decodeEntities(href) ? label : `${label} (${href})`;
    })
    .replace(/<img\b[^>]*?\balt\s*=\s*(["'])(.*?)\1[^>]*>/gi, (_, _q: string, alt: string) => alt)
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(li|tr)\s*>/gi, '\n')
    .replace(/<\/(p|div|ul|ol|h[1-6]|table|blockquote)\s*>/gi, '\n\n');
  return decodeEntities(stripTags(text))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

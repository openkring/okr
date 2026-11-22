const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…',
};

/** A numeric entity outside the Unicode range would make String.fromCodePoint throw; it counts as '?'. */
function fromCodePoint(codePoint: number): string {
  return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '?';
}

/** An unknown named entity still counts as one character, which is what the author sees. */
function decodeEntity(entity: string): string {
  if (entity.startsWith('#x') || entity.startsWith('#X')) return fromCodePoint(parseInt(entity.slice(2), 16));
  if (entity.startsWith('#')) return fromCodePoint(parseInt(entity.slice(1), 10));
  return NAMED_ENTITIES[entity] ?? '?';
}

/**
 * The text an author sees in an HTML value: tags removed, entities decoded, one line break per
 * `<br>` and per closed block. Pure (no DOM), so it runs in forms, Vest suites and functions alike.
 */
export function htmlToVisibleText(html: string | undefined | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|pre)>(?!$)/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity: string) => decodeEntity(entity))
    .replace(/\n+$/, '');
}

/**
 * Length of an HTML value as the author sees it (spec 1.170 D3): the counter and the Vest caps of
 * rich-text fields count this, never the markup. Counts code points, so an emoji is one character.
 */
export function htmlTextLength(html: string | undefined | null): number {
  return [...htmlToVisibleText(html)].length;
}

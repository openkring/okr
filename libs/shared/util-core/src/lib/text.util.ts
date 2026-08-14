import { stripHtml } from './convert.util';

/**
 * Substitutes `{name}` placeholders in an already-translated string.
 *
 * Transloco's own `{{name}}` interpolation cannot be used with the store-driven
 * i18n pattern: `translateAll()` resolves keys without params, so `{{name}}` is
 * substituted with an empty string. Any translation string used with this helper
 * must therefore use single braces (`{name}`), which Transloco passes through.
 */
export function fill(template: string, params: Record<string, string | number>): string {
  // split/join, not replaceAll: this lib's tsconfig target predates String.replaceAll.
  return Object.entries(params).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), template);
}

/**
 * Shortens text to a given number of words.
 * @param text - plain text or HTML string
 * @param numberOfWords - maximum number of words to keep
 * @param isHtml - when true, HTML tags are stripped before counting words
 */
export function shortenText(text: string, numberOfWords: number, isHtml = false): string {
  // Delegate HTML stripping to stripHtml (fixpoint tag removal + residual-'<' escaping + length cap).
  const plain = isHtml ? stripHtml(text).trim() : text.trim();
  const words = plain.split(/\s+/).filter(Boolean);
  return words.slice(0, numberOfWords).join(' ') + (words.length > numberOfWords ? '…' : '');
}

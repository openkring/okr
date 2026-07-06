/**
 * Shortens text to a given number of words.
 * @param text - plain text or HTML string
 * @param numberOfWords - maximum number of words to keep
 * @param isHtml - when true, HTML tags are stripped before counting words
 */
export function shortenText(text: string, numberOfWords: number, isHtml = false): string {
  // Cap input before the tag-strip regex to avoid polynomial ReDoS; output is word-limited anyway.
  const capped = text.length > 50_000 ? text.slice(0, 50_000) : text;
  const plain = isHtml ? capped.replace(/<[^>]*>/g, '').trim() : capped.trim();
  const words = plain.split(/\s+/).filter(Boolean);
  return words.slice(0, numberOfWords).join(' ') + (words.length > numberOfWords ? '…' : '');
}

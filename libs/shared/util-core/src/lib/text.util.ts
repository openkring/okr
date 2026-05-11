/**
 * Shortens text to a given number of words.
 * @param text - plain text or HTML string
 * @param numberOfWords - maximum number of words to keep
 * @param isHtml - when true, HTML tags are stripped before counting words
 */
export function shortenText(text: string, numberOfWords: number, isHtml = false): string {
  const plain = isHtml ? text.replace(/<[^>]*>/g, '').trim() : text.trim();
  const words = plain.split(/\s+/).filter(Boolean);
  return words.slice(0, numberOfWords).join(' ') + (words.length > numberOfWords ? '…' : '');
}

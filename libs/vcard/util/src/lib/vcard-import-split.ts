/**
 * Cut a `.vcf` text into one string per card, so a 67 MB export can be parsed in chunks with
 * the UI breathing in between (spec 1.159 §4.4). A block runs from a `BEGIN:VCARD` line to the
 * line before the next one; an unterminated last card stays a block, so `parseVcards` still
 * counts it as skipped. Text before the first card is dropped.
 */
export function splitVcardBlocks(text: string): string[] {
  const re = /^BEGIN:VCARD[ \t]*\r?$/gim;
  const starts: number[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) starts.push(m.index);
  return starts.map((start, i) => text.slice(start, starts[i + 1] ?? text.length));
}

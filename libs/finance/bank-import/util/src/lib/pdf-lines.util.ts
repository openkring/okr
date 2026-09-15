/** A positioned text item as pdf.js reports it (`transform[4]` = x, `transform[5]` = y). */
export interface PositionedTextItem { str: string; transform: number[] }

const Y_TOLERANCE = 2;

/**
 * Turns positioned PDF text items into one string per visual line (spec §4.10): items are grouped by
 * their y position (±2 pt, top of the page first), the items of a line are sorted by x and joined with
 * one space. This is the text shape the Swissquote adapter is written against.
 */
export function groupTextItemsIntoLines(items: PositionedTextItem[]): string[] {
  const lines: { y: number; items: { x: number; str: string }[] }[] = [];
  for (const it of items) {
    if (it.str.trim() === '') continue;
    const y = Math.round(it.transform[5]);
    const x = it.transform[4];
    let line = lines.find(l => Math.abs(l.y - y) <= Y_TOLERANCE);
    if (!line) { line = { y, items: [] }; lines.push(line); }
    line.items.push({ x, str: it.str });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map(l => l.items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim());
}

/** Safari may send an empty type, so the extension counts too (as for CSV, spec §6.2). */
export function isPdfFile(file: { type: string; name: string }): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

import { describe, expect, it } from 'vitest';

import { groupTextItemsIntoLines, isPdfFile } from './pdf-lines.util';

const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });

describe('groupTextItemsIntoLines', () => {
  it('groups items by y (top first), orders them by x and joins with one space', () => {
    const lines = groupTextItemsIntoLines([
      item('Zinsen', 120, 700.4), item('01.01.2025', 40, 700), item('+0.79 CHF', 400, 701.6),
      item('  ', 10, 700), item('Wechselkurs: 1 CHF', 120, 688), item('= 1.09 USD', 220, 688),
    ]);
    expect(lines).toEqual(['01.01.2025 Zinsen +0.79 CHF', 'Wechselkurs: 1 CHF = 1.09 USD']);
  });
  it('keeps items further than the tolerance apart on separate lines', () => {
    expect(groupTextItemsIntoLines([item('a', 0, 100), item('b', 0, 97)])).toEqual(['a', 'b']);
  });
});

describe('isPdfFile', () => {
  it('accepts the PDF mime type and, for Safari, the extension alone', () => {
    expect(isPdfFile(new File([''], 'x.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isPdfFile(new File([''], 'Statement.PDF', { type: '' }))).toBe(true);
    expect(isPdfFile(new File([''], 'x.csv', { type: 'text/csv' }))).toBe(false);
  });
});

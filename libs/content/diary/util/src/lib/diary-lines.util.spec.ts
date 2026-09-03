import { describe, expect, it } from 'vitest';
import { csvToList, linesToList, listToCsv, listToLines } from './diary-lines.util';

describe('lines', () => {
  it('splits on newlines, trims, drops empties and a leading "- [x] "', () => {
    expect(linesToList(' a \n\n- [x] b\n- c\r\n')).toEqual(['a', 'b', 'c']);
  });
  it('joins with newlines', () => expect(listToLines(['a', 'b'])).toBe('a\nb'));
});

describe('csv', () => {
  it('splits on commas and trims', () => expect(csvToList('ostern, weihnachten ,,')).toEqual(['ostern', 'weihnachten']));
  it('joins with ", "', () => expect(listToCsv(['a', 'b'])).toBe('a, b'));
});

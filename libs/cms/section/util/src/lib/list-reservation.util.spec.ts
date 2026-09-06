import { describe, expect, it } from 'vitest';

import { getReservedListHeightPx, SECTION_LIST_DEFAULT_ROWS, SECTION_LIST_ROW_HEIGHT_PX } from './list-reservation.util';

describe('getReservedListHeightPx', () => {
  it('reserves maxItems compact rows', () => {
    expect(getReservedListHeightPx(5)).toBe(5 * SECTION_LIST_ROW_HEIGHT_PX);
  });

  it('falls back to the default rows when the section has no cap', () => {
    expect(getReservedListHeightPx(undefined)).toBe(SECTION_LIST_DEFAULT_ROWS * SECTION_LIST_ROW_HEIGHT_PX);
  });

  it('falls back for zero, negative and non-finite caps', () => {
    const fallback = SECTION_LIST_DEFAULT_ROWS * SECTION_LIST_ROW_HEIGHT_PX;
    expect(getReservedListHeightPx(0)).toBe(fallback);
    expect(getReservedListHeightPx(-3)).toBe(fallback);
    expect(getReservedListHeightPx(Number.NaN)).toBe(fallback);
    expect(getReservedListHeightPx(Number.POSITIVE_INFINITY)).toBe(fallback);
  });

  it('truncates fractional caps to whole rows', () => {
    expect(getReservedListHeightPx(2.7)).toBe(2 * SECTION_LIST_ROW_HEIGHT_PX);
  });

  it('honours custom row height and default rows', () => {
    expect(getReservedListHeightPx(undefined, { rowHeightPx: 40, defaultRows: 4 })).toBe(160);
    expect(getReservedListHeightPx(3, { rowHeightPx: 40, defaultRows: 4 })).toBe(120);
  });
});

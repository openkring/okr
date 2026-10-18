import { afterEach, describe, expect, it } from 'vitest';

import { getReservedListHeightPx, readListRowCount, SECTION_LIST_DEFAULT_ROWS, SECTION_LIST_ROW_HEIGHT_PX, writeListRowCount } from './list-reservation.util';

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

  it('reserves the remembered row count, capped by maxItems', () => {
    expect(getReservedListHeightPx(5, { lastRowCount: 2 })).toBe(2 * SECTION_LIST_ROW_HEIGHT_PX);
    expect(getReservedListHeightPx(5, { lastRowCount: 9 })).toBe(5 * SECTION_LIST_ROW_HEIGHT_PX);
    expect(getReservedListHeightPx(undefined, { lastRowCount: 7 })).toBe(SECTION_LIST_DEFAULT_ROWS * SECTION_LIST_ROW_HEIGHT_PX);
  });

  it('reserves one row for a remembered empty state', () => {
    expect(getReservedListHeightPx(5, { lastRowCount: 0 })).toBe(SECTION_LIST_ROW_HEIGHT_PX);
  });

  it('ignores invalid remembered counts', () => {
    expect(getReservedListHeightPx(4, { lastRowCount: -1 })).toBe(4 * SECTION_LIST_ROW_HEIGHT_PX);
    expect(getReservedListHeightPx(4, { lastRowCount: Number.NaN })).toBe(4 * SECTION_LIST_ROW_HEIGHT_PX);
  });
});

describe('readListRowCount / writeListRowCount', () => {
  afterEach(() => localStorage.clear());

  it('round-trips a row count per section key', () => {
    writeListRowCount('d-tasks', 2);
    expect(readListRowCount('d-tasks')).toBe(2);
    expect(readListRowCount('d-events')).toBeUndefined();
  });

  it('returns undefined without a key or for garbage values', () => {
    expect(readListRowCount(undefined)).toBeUndefined();
    localStorage.setItem('okr.sectionRows.x', 'abc');
    expect(readListRowCount('x')).toBeUndefined();
  });
});

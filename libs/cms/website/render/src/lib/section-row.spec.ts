import { describe, expect, it } from 'vitest';
import { isNarrowSection, sectionColumnWidths, sectionRows } from './section-row';

describe('sectionColumnWidths', () => {
  it('defaults to full width and inherits upward', () => {
    expect(sectionColumnWidths(undefined)).toEqual({ sm: 12, md: 12, lg: 12 });
    expect(sectionColumnWidths('12,6')).toEqual({ sm: 12, md: 6, lg: 6 });
    expect(sectionColumnWidths('12,12,4')).toEqual({ sm: 12, md: 12, lg: 4 });
    expect(sectionColumnWidths('6')).toEqual({ sm: 6, md: 6, lg: 6 });
  });
  it('ignores invalid parts', () => expect(sectionColumnWidths('0,x,13')).toEqual({ sm: 12, md: 12, lg: 12 }));
  it('narrow when any screen is below 12', () => {
    expect(isNarrowSection(sectionColumnWidths('12'))).toBe(false);
    expect(isNarrowSection(sectionColumnWidths('12,12,6'))).toBe(true);
  });
});

describe('sectionRows', () => {
  const s = (colSize: string, type = 'article') => ({ type, colSize });
  it('groups consecutive narrow sections', () => {
    expect(sectionRows([s('12'), s('12,6'), s('12,6'), s('12'), s('12,4')])).toEqual([[1, 2], [4]]);
  });
  it('a skipped section neither joins nor breaks a run', () => {
    expect(sectionRows([s('12,6'), null, s('12,6')])).toEqual([[0, 2]]);
  });
  it('a hero or a slideshow is always full width', () => {
    expect(sectionRows([s('12,6'), s('12,6', 'hero'), s('12,6')])).toEqual([[0], [2]]);
    expect(sectionRows([s('12,6'), { type: 'article', colSize: '12,6', slideshow: {} }])).toEqual([[0]]);
  });
  it('none when every section is full width', () => expect(sectionRows([s('12'), s('')])).toEqual([]));
});

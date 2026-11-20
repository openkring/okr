import { describe, expect, it } from 'vitest';
import { formatSectionWidths, parseSectionWidths, sectionWidthChoices, setSectionWidth } from './section-width.util';

describe('parseSectionWidths', () => {
  it('defaults to full width', () => {
    expect(parseSectionWidths(undefined)).toEqual({ sm: 12, md: 12, lg: 12 });
    expect(parseSectionWidths('')).toEqual({ sm: 12, md: 12, lg: 12 });
  });
  it('lets a missing screen inherit the smaller one', () => {
    expect(parseSectionWidths('6')).toEqual({ sm: 6, md: 6, lg: 6 });
    expect(parseSectionWidths('12,6')).toEqual({ sm: 12, md: 6, lg: 6 });
    expect(parseSectionWidths('12,12,6')).toEqual({ sm: 12, md: 12, lg: 6 });
  });
  it('ignores invalid parts', () => {
    expect(parseSectionWidths('0,13,x')).toEqual({ sm: 12, md: 12, lg: 12 });
    expect(parseSectionWidths(' 12 , 6 ')).toEqual({ sm: 12, md: 6, lg: 6 });
  });
});

describe('formatSectionWidths', () => {
  it('stores the shortest form', () => {
    expect(formatSectionWidths({ sm: 12, md: 12, lg: 12 })).toBe('12');
    expect(formatSectionWidths({ sm: 12, md: 6, lg: 6 })).toBe('12,6');
    expect(formatSectionWidths({ sm: 12, md: 12, lg: 6 })).toBe('12,12,6');
    expect(formatSectionWidths({ sm: 12, md: 6, lg: 4 })).toBe('12,6,4');
  });
  it('round-trips', () => {
    for (const s of ['12', '6', '12,6', '12,12,6', '12,8,4']) expect(formatSectionWidths(parseSectionWidths(s))).toBe(s);
  });
});

describe('setSectionWidth', () => {
  it('changes one screen and keeps the others', () => {
    expect(setSectionWidth('12', 'md', 6)).toBe('12,6');
    expect(setSectionWidth('12,6', 'lg', 4)).toBe('12,6,4');
    expect(setSectionWidth('12,6,4', 'lg', 6)).toBe('12,6');
    expect(setSectionWidth(undefined, 'sm', 6)).toBe('6');
  });
  it('a larger screen keeps its own value when a smaller one changes', () => {
    expect(setSectionWidth('12,6', 'sm', 4)).toBe('4,6');
    expect(setSectionWidth('12,12,4', 'md', 6)).toBe('12,6,4');
  });
  it('larger screens that inherited the width follow it', () => {
    expect(setSectionWidth('12', 'sm', 6)).toBe('6');
    expect(setSectionWidth('12,6', 'md', 4)).toBe('12,4');
  });
});

describe('sectionWidthChoices', () => {
  it('offers the standard widths', () => expect(sectionWidthChoices(6)).toEqual([12, 8, 6, 4, 3]));
  it('keeps an odd stored width', () => expect(sectionWidthChoices(5)).toEqual([12, 8, 6, 5, 4, 3]));
});

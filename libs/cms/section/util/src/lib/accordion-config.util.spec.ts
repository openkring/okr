import { describe, expect, it } from 'vitest';

import { accordionColumnCount, accordionOpenValues, accordionSize, splitIntoColumns, withAccordionDefaults } from './accordion-config.util';

describe('withAccordionDefaults', () => {
  it('fills a legacy list accordion', () => {
    const cfg = withAccordionDefaults({ multiple: true, readonly: true, value: '', items: [] });
    expect(cfg.viewType).toBe('list');
    expect(cfg.columns).toEqual({ sm: 1, md: 2, lg: 2 });
    expect(cfg.titleStyle).toBe('regular');
    expect(cfg.titleSize).toBe(1);
    expect(cfg.textSize).toBe(1);
    expect(cfg.iconClosed).toBe('chevron-down');
    expect(cfg.iconOpen).toBe('chevron-up');
    expect(cfg.iconPosition).toBe('start');
    expect(cfg.iconColor).toBe('');
    expect(cfg.textBackground).toBe('');
  });

  it('uses plus/minus as default icons for cards', () => {
    const cfg = withAccordionDefaults({ multiple: true, readonly: true, value: '', items: [], viewType: 'cards' });
    expect(cfg.iconClosed).toBe('add');
    expect(cfg.iconOpen).toBe('remove');
    expect(cfg.iconPosition).toBe('end');
  });

  it('keeps configured values and clamps columns', () => {
    const cfg = withAccordionDefaults({
      multiple: false, readonly: true, value: 'a', items: [], viewType: 'cards',
      columns: { sm: 0, md: 3, lg: 9 }, titleStyle: 'underline', iconClosed: ' plus ', iconPosition: 'start',
    });
    expect(cfg.columns).toEqual({ sm: 1, md: 3, lg: 4 });
    expect(cfg.titleStyle).toBe('underline');
    expect(cfg.iconClosed).toBe('plus');
    expect(cfg.iconPosition).toBe('start');
  });

  it('survives undefined', () => {
    expect(withAccordionDefaults(undefined).items).toEqual([]);
  });
});

describe('accordionColumnCount / accordionSize', () => {
  it('clamps and falls back', () => {
    expect(accordionColumnCount(undefined, 2)).toBe(2);
    expect(accordionColumnCount(NaN, 2)).toBe(2);
    expect(accordionColumnCount(5, 1)).toBe(4);
    expect(accordionSize(undefined)).toBe(1);
    expect(accordionSize(0)).toBe(1);
    expect(accordionSize(0.1)).toBe(0.5);
    expect(accordionSize(1.25)).toBe(1.25);
    expect(accordionSize(10)).toBe(3);
  });
});

describe('splitIntoColumns', () => {
  it('splits column-major', () => {
    expect(splitIntoColumns([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 2)).toEqual([[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11]]);
    expect(splitIntoColumns([1, 2, 3], 1)).toEqual([[1, 2, 3]]);
  });

  it('never makes more columns than items', () => {
    expect(splitIntoColumns([1, 2], 4)).toEqual([[1], [2]]);
    expect(splitIntoColumns([], 3)).toEqual([[]]);
  });
});

describe('accordionOpenValues', () => {
  it('splits comma separated values', () => {
    expect(accordionOpenValues('a, b')).toEqual(['a', 'b']);
    expect(accordionOpenValues('')).toEqual([]);
    expect(accordionOpenValues(undefined)).toEqual([]);
  });
});

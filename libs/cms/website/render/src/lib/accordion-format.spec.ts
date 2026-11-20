import { describe, expect, it } from 'vitest';

import { accordionColor, accordionIconUrl, accordionLayouts, accordionSizeRem, mapAccordionFormat, splitAccordionColumns } from './accordion-format';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ label: 'L' + i, content: '' }));

describe('mapAccordionFormat', () => {
  it('keeps a legacy accordion a list with default icons', () => {
    const f = mapAccordionFormat({ items: [] }, []);
    expect(f.view).toBe('list');
    expect(f.titleClass).toBe('');
    expect(f.iconStart).toBe(false);
    expect(f.exclusive).toBe(false);
    expect(f.layouts).toEqual([]);
    expect(f.style).toContain("--acc-icon-closed:url('https://bkaiser.imgix.net/logo/icons/chevron-down.svg')");
    expect(f.style).toContain('--acc-title-size:1rem');
    expect(f.style).not.toContain('--acc-icon-color');
  });

  it('maps a cards accordion like the la21staefa one', () => {
    const f = mapAccordionFormat({
      viewType: 'cards', titleStyle: 'underline', titleSize: 1.25, iconColor: '#999999', textBackground: '#e2d6e2',
      multiple: false, columns: { sm: 1, md: 2, lg: 2 },
    }, items(11));
    expect(f.view).toBe('cards');
    expect(f.titleClass).toBe('acc-t-underline');
    expect(f.exclusive).toBe(true);
    expect(f.style).toContain('--acc-title-size:1.25rem');
    expect(f.style).toContain('--acc-icon-color:#999999');
    expect(f.style).toContain('--acc-text-bg:#e2d6e2');
    expect(f.style).toContain('/logo/icons/add.svg');
    expect(f.style).toContain('/logo/icons/remove.svg');
    expect(f.layouts.map((l) => l.cls)).toEqual(['acc-sm', 'acc-md acc-lg']);
    expect(f.layouts[1].columns.map((c) => c.items.length)).toEqual([6, 5]);
  });

  it('drops unsafe values', () => {
    const f = mapAccordionFormat({ iconColor: 'red;background:url(x)', textBackground: 'expression()', iconClosed: '../evil', titleStyle: 'blink' }, []);
    expect(f.style).not.toContain('red');
    expect(f.style).not.toContain('expression');
    expect(f.style).not.toContain('evil');
    expect(f.titleClass).toBe('');
  });
});

describe('helpers', () => {
  it('validates colours, sizes and icon names', () => {
    expect(accordionColor('#abc')).toBe('#abc');
    expect(accordionColor('blue')).toBe('');
    expect(accordionSizeRem(undefined)).toBe(1);
    expect(accordionSizeRem(9)).toBe(3);
    expect(accordionSizeRem('0.2')).toBe(0.5);
    expect(accordionIconUrl('filetypes:pdf', 'add')).toBe('https://bkaiser.imgix.net/logo/filetypes/pdf.svg');
    expect(accordionIconUrl('', 'add')).toBe('https://bkaiser.imgix.net/logo/icons/add.svg');
  });

  it('splits column-major and never into more columns than items', () => {
    expect(splitAccordionColumns([1, 2, 3, 4, 5], 2)).toEqual([[1, 2, 3], [4, 5]]);
    expect(splitAccordionColumns([1], 3)).toEqual([[1]]);
    expect(accordionLayouts(items(2), { sm: 1, md: 3, lg: 4 }).map((l) => l.cls)).toEqual(['acc-sm', 'acc-md acc-lg']);
    expect(accordionLayouts(items(5), { sm: 1, md: 1, lg: 1 }).map((l) => l.cls)).toEqual(['acc-sm acc-md acc-lg']);
  });
});

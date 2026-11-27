import { describe, expect, it } from 'vitest';

import { TABLE_CONFIG_SHAPE, TableConfig } from '@okr/shared-models';

import {
  applyTableLook, applyTableSize, deleteTableColumn, deleteTableRow, effectiveTableMode, fluidTemplateOf, insertTableColumn, insertTableRow,
  isClipboardTable, moveTableRow, parseClipboardTable, pasteTableCells, setTableCell, tableColumnsOf, tableContentOf, tableLookOf,
  tableResponsiveOf, tableSizeOf, templateOf, templateTracks, withTableContent,
} from './table-layout.util';

const config = (patch: Partial<TableConfig>): TableConfig => ({ ...structuredClone(TABLE_CONFIG_SHAPE), ...patch });

describe('templateTracks', () => {
  it('splits at spaces outside of parentheses', () => {
    expect(templateTracks('minmax(4rem, 100px)  auto')).toEqual(['minmax(4rem, 100px)', 'auto']);
  });
  it('is empty for no template', () => {
    expect(templateTracks(undefined)).toEqual([]);
  });
});

describe('tableColumnsOf', () => {
  it('reads the stored template, recognising the preset widths', () => {
    expect(tableColumnsOf(config({ grid: { ...TABLE_CONFIG_SHAPE.grid, template: '300px auto' } }))).toEqual([{ width: 'wide' }, { width: 'auto' }]);
    expect(tableColumnsOf(config({ grid: { ...TABLE_CONFIG_SHAPE.grid, template: '25% 25% 25% 25%' } })).map((c) => c.width)).toEqual(['25%', '25%', '25%', '25%']);
  });
  it('prefers the columns the editor stored', () => {
    expect(tableColumnsOf(config({ columns: [{ width: 'narrow', align: 'right' }] }))).toEqual([{ width: 'narrow', align: 'right' }]);
  });
  it('falls back to one column per header cell, at least one', () => {
    expect(tableColumnsOf({ data: { header: ['a', 'b', 'c'], body: [] } } as unknown as TableConfig)).toHaveLength(3);
    expect(tableColumnsOf(undefined)).toHaveLength(1);
  });
});

describe('templates', () => {
  it('stores presets as the widths older apps read', () => {
    expect(templateOf([{ width: 'narrow' }, { width: 'wide' }, { width: 'auto' }, { width: '20%' }])).toBe('100px 300px auto 20%');
  });
  it('draws px widths flexibly', () => {
    expect(fluidTemplateOf([{ width: 'wide' }, { width: 'auto' }])).toBe('minmax(6rem, 300px) auto');
    expect(fluidTemplateOf([{ width: '120px' }])).toBe('minmax(min(120px, 6rem), 120px)');
    expect(fluidTemplateOf([{ width: '25%' }])).toBe('25%');
  });
});

describe('tableContentOf / withTableContent', () => {
  const stored = config({ grid: { ...TABLE_CONFIG_SHAPE.grid, template: 'auto auto' }, data: { header: [], body: ['a', 'b', 'c'] } });

  it('groups the body into rows and fills up the last one', () => {
    const content = tableContentOf(stored);
    expect(content.hasHeader).toBe(false);
    expect(content.rows).toEqual([['a', 'b'], ['c', '']]);
    expect(content.header).toEqual(['', '']);
  });
  it('reads number cells as text', () => {
    const content = tableContentOf({ ...stored, data: { header: ['x', 'y'], body: ['U15', 1 as unknown as string] } });
    expect(content.rows).toEqual([['U15', '1']]);
    expect(content.hasHeader).toBe(true);
  });
  it('writes data, columns and template back', () => {
    const written = withTableContent(stored, { ...tableContentOf(stored), columns: [{ width: 'narrow' }, { width: 'auto' }] });
    expect(written.data).toEqual({ header: [], body: ['a', 'b', 'c', ''] });
    expect(written.grid.template).toBe('100px auto');
    expect(written.columns).toEqual([{ width: 'narrow' }, { width: 'auto' }]);
  });
});

describe('row and column operations', () => {
  const content = tableContentOf(config({ grid: { ...TABLE_CONFIG_SHAPE.grid, template: 'auto auto' }, data: { header: ['h1', 'h2'], body: ['a', 'b', 'c', 'd'] } }));

  it('inserts, deletes and moves rows', () => {
    expect(insertTableRow(content, 1).rows).toEqual([['a', 'b'], ['', ''], ['c', 'd']]);
    expect(deleteTableRow(content, 0).rows).toEqual([['c', 'd']]);
    expect(moveTableRow(content, 1, -1).rows).toEqual([['c', 'd'], ['a', 'b']]);
    expect(moveTableRow(content, 1, 1)).toBe(content);
  });
  it('inserts and deletes columns, keeping the last one', () => {
    const wider = insertTableColumn(content, 1);
    expect(wider.header).toEqual(['h1', '', 'h2']);
    expect(wider.rows[0]).toEqual(['a', '', 'b']);
    expect(wider.columns).toHaveLength(3);
    expect(deleteTableColumn(content, 0).rows).toEqual([['b'], ['d']]);
    const single = deleteTableColumn(content, 0);
    expect(deleteTableColumn(single, 0)).toBe(single);
  });
  it('sets a cell or a header cell', () => {
    expect(setTableCell(content, { row: 1, col: 0 }, 'x').rows[1]).toEqual(['x', 'd']);
    expect(setTableCell(content, { row: -1, col: 1 }, 'H').header).toEqual(['h1', 'H']);
  });
});

describe('responsive', () => {
  it('defaults to auto below mobile', () => {
    expect(tableResponsiveOf(undefined)).toEqual({ mode: 'auto', breakpoint: 'mobile' });
  });
  it('auto stacks up to two columns and scrolls wider tables', () => {
    expect(effectiveTableMode('auto', 2)).toBe('stack');
    expect(effectiveTableMode('auto', 3)).toBe('scroll');
    expect(effectiveTableMode('stack', 4)).toBe('stack');
  });
});

describe('looks and sizes', () => {
  it('detects the look it applied, and none for stored styles of their own', () => {
    expect(tableLookOf(applyTableLook(config({}), 'colored'))).toBe('colored');
    expect(tableLookOf(config({}))).toBeUndefined();
  });
  it('detects the size it applied; a table without sizes is medium', () => {
    expect(tableSizeOf(applyTableSize(config({}), 'l'))).toBe('l');
    expect(tableSizeOf({ header: {}, body: {} } as TableConfig)).toBe('m');
  });
});

describe('parseClipboardTable', () => {
  it('reads tabs and lines as Excel copies them', () => {
    expect(parseClipboardTable('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('keeps tabs, line breaks and quotes in a quoted cell', () => {
    expect(parseClipboardTable('"x\ny"\t"say ""hi"""\n')).toEqual([['x\ny', 'say "hi"']]);
  });
  it('keeps empty cells', () => {
    expect(parseClipboardTable('a\t\tc')).toEqual([['a', '', 'c']]);
  });
  it('tells a table from plain text', () => {
    expect(isClipboardTable(parseClipboardTable('just text'))).toBe(false);
    expect(isClipboardTable(parseClipboardTable('a\tb'))).toBe(true);
    expect(isClipboardTable(parseClipboardTable('a\nb'))).toBe(true);
  });
});

describe('pasteTableCells', () => {
  const content = tableContentOf(config({ grid: { ...TABLE_CONFIG_SHAPE.grid, template: 'auto auto' }, data: { header: [], body: ['a', 'b'] } }));

  it('pastes from a cell and adds rows and columns as needed, escaping HTML', () => {
    const pasted = pasteTableCells(content, { row: 0, col: 1 }, [['x', '<y>'], ['z', 'w\nv']]);
    expect(pasted.columns).toHaveLength(3);
    expect(pasted.rows).toEqual([['a', 'x', '&lt;y&gt;'], ['', 'z', 'w<br>v']]);
  });
  it('fills the header with the first row when pasted into the header row', () => {
    const pasted = pasteTableCells(content, { row: -1, col: 0 }, [['H1', 'H2'], ['1', '2']]);
    expect(pasted.hasHeader).toBe(true);
    expect(pasted.header).toEqual(['H1', 'H2']);
    expect(pasted.rows[0]).toEqual(['1', '2']);
  });
});

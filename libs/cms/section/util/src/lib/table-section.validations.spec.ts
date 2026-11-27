import { describe, expect, it } from 'vitest';
import { TABLE_SECTION_SHAPE, TableSection } from '@okr/shared-models';

import { tableSectionValidations } from './table-section.validations';

describe('tableSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(tableSectionValidations({ ...TABLE_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...TABLE_SECTION_SHAPE, title: 123 } as unknown as TableSection;
    expect(tableSectionValidations(model).hasErrors('title')).toBe(true);
  });
});

describe('tableSectionValidations: content', () => {
  const withProps = (patch: Partial<TableSection['properties']>): TableSection =>
    ({ ...TABLE_SECTION_SHAPE, properties: { ...TABLE_SECTION_SHAPE.properties, ...patch } }) as TableSection;

  it('accepts number cells of older documents', () => {
    const model = withProps({ data: { header: ['a'], body: [1 as unknown as string] } });
    expect(tableSectionValidations(model).hasErrors()).toBe(false);
  });

  it('flags a cell that is too long', () => {
    const model = withProps({ data: { header: [], body: ['x'.repeat(5001)] } });
    expect(tableSectionValidations(model).hasErrors('data.body')).toBe(true);
  });

  it('flags an unknown responsive mode and an invalid column', () => {
    const model = withProps({ responsive: { mode: 'hide' as never, breakpoint: 'mobile' }, columns: [{ width: '' }] });
    const result = tableSectionValidations(model);
    expect(result.hasErrors('responsive.mode')).toBe(true);
    expect(result.hasErrors('columns')).toBe(true);
  });
});

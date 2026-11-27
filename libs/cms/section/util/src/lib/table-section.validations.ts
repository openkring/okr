import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { TABLE_BREAKPOINTS, TABLE_RESPONSIVE_MODES, TableSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { TABLE_ALIGNS } from './table-layout.util';

/** the longest cell (HTML): an Impressum cell with a licence text runs to about 1000 characters */
export const TABLE_CELL_LENGTH = DESCRIPTION_LENGTH;

/** a cell as text: older documents store numbers too, which readers draw as text */
const cellLength = (cell: unknown): number => (cell === undefined || cell === null ? 0 : String(cell).length);

export const tableSectionValidations = staticSuite((model: TableSection) => {
  baseSectionValidations(model);
  const config = model.properties;

  // one error per part, not per cell: the editor shows it once, above the table
  test('data.header', 'tooLong', () => {
    enforce((config?.data?.header ?? []).every((cell) => cellLength(cell) <= TABLE_CELL_LENGTH)).isTruthy();
  });
  test('data.body', 'tooLong', () => {
    enforce((config?.data?.body ?? []).every((cell) => cellLength(cell) <= TABLE_CELL_LENGTH)).isTruthy();
  });

  // the template is written by the editor from the columns, or typed under «Anpassen»
  omitWhen(config?.grid?.template === undefined, () => {
    test('grid.template', 'tooLong', () => {
      enforce(config?.grid?.template ?? '').shorterThanOrEquals(NAME_LENGTH * 2);
    });
  });

  omitWhen(!config?.columns, () => {
    test('columns', 'invalidValue', () => {
      enforce((config?.columns ?? []).every((c) => typeof c.width === 'string' && c.width.length > 0 && c.width.length <= NAME_LENGTH
        && (c.align === undefined || TABLE_ALIGNS.includes(c.align)))).isTruthy();
    });
  });

  omitWhen(!config?.responsive, () => {
    test('responsive.mode', 'invalidValue', () => {
      enforce(TABLE_RESPONSIVE_MODES.includes(config?.responsive?.mode as never)).isTruthy();
    });
    test('responsive.breakpoint', 'invalidValue', () => {
      enforce(TABLE_BREAKPOINTS.includes(config?.responsive?.breakpoint as never)).isTruthy();
    });
  });
});

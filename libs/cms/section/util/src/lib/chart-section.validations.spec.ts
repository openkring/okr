import { describe, expect, it } from 'vitest';
import { CHART_SECTION_SHAPE, ChartSection } from '@bk2/shared-models';

import { chartSectionValidations } from './chart-section.validations';

describe('chartSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(chartSectionValidations({ ...CHART_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...CHART_SECTION_SHAPE, title: 123 } as unknown as ChartSection;
    expect(chartSectionValidations(model).hasErrors('title')).toBe(true);
  });
});

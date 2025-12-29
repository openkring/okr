import { only, staticSuite } from 'vest';

import { ChartSection } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const chartSectionValidations = staticSuite((model: ChartSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

    // tbd: properties: EChartsOption (from ECharts)
});

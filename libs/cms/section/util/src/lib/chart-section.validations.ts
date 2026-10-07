import { staticSuite } from 'vest';

import { ChartSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const chartSectionValidations = staticSuite((model: ChartSection) => {
  baseSectionValidations(model);

    // tbd: properties: EChartsOption (from ECharts)
});

import { only, staticSuite } from 'vest';

import { SliderSection } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const sliderSectionValidations = staticSuite((model: SliderSection, field?: string) => {
    if (field) only(field);

    baseSectionValidations(model, field);

    // tbd: images: ImageConfig[]
    // tbd: display: ImageDisplayConfig
    // tbd: action: ImageActionConfig
});

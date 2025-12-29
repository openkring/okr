import { only, staticSuite } from 'vest';

import { HeroSection } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const heroSectionValidations = staticSuite((model: HeroSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

    // tbd: logo: ImageConfig
    // tbd: hero: ImageConfig

    // tbd: display: ImageDisplayConfig
    // tbd: action: ImageActionConfig

});

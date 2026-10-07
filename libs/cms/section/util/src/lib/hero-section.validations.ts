import { omitWhen, staticSuite } from 'vest';

import { HeroSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { imageStyleValidations, optionalImageSlotValidations } from './image.validations';

export const heroSectionValidations = staticSuite((model: HeroSection) => {
  baseSectionValidations(model);

  // logo / hero: ImageConfig — both single slots, both optional on older stored sections.
  optionalImageSlotValidations('logo', model.properties?.logo);
  optionalImageSlotValidations('hero', model.properties?.hero);

  // imageStyle: ImageStyle
  omitWhen(!model.properties?.imageStyle, () => {
    imageStyleValidations(model.properties?.imageStyle);
  });

  // tbd: display: ImageDisplayConfig
  // tbd: action: ImageActionConfig
});

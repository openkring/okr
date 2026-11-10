import { each, enforce, omitWhen, staticSuite, test } from 'vest';

import { HeroSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { isSectionCtaUrl } from './section-cta.util';
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

  // ctas: at most two buttons, each with a label and a safe target (all optional on older sections)
  omitWhen(!model.properties?.ctas?.length, () => {
    test('ctas', 'invalidValue', () => {
      enforce((model.properties?.ctas ?? []).length).lessThanOrEquals(2);
    });
    each(model.properties?.ctas ?? [], (cta, index) => {
      test(`ctas[${index}].label`, 'required', () => {
        enforce(cta?.label?.trim()).isNotEmpty();
      });
      test(`ctas[${index}].url`, 'invalidValue', () => {
        enforce(isSectionCtaUrl(cta?.url ?? '')).isTruthy();
      });
    });
  });

  // tbd: display: ImageDisplayConfig
  // tbd: action: ImageActionConfig
});

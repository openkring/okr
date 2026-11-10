import { each, enforce, omitWhen, staticSuite, test } from 'vest';

import { ArticleSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { isSectionCtaUrl } from './section-cta.util';
import { imageConfigValidations, imageStyleValidations } from './image.validations';

export const articleSectionValidations = staticSuite((model: ArticleSection) => {
  baseSectionValidations(model);

  // images: ImageConfig[]
  // note: omitWhen always runs its callback (it only omits the tests inside), so the
  // iterated value must be null-safe — older stored sections may lack `images`.
  omitWhen(!model.properties?.images?.length, () => {
    each(model.properties?.images ?? [], (image, index) => {
      imageConfigValidations(`images[${index}]`, image);
    });
  });

  // imageStyle: ImageStyle
  // note: omitWhen always runs its callback, so guard every access with `?.`.
  omitWhen(!model.properties?.imageStyle, () => {
    imageStyleValidations(model.properties?.imageStyle);
  });

  // cta: label and url both or neither; a set url must be a safe target
  const cta = model.properties?.cta;
  omitWhen(!cta?.label?.trim() && !cta?.url?.trim(), () => {
    test('cta.label', 'required', () => {
      enforce(cta?.label?.trim()).isNotEmpty();
    });
    test('cta.url', 'required', () => {
      enforce(cta?.url?.trim()).isNotEmpty();
    });
    omitWhen(!cta?.url?.trim(), () => {
      test('cta.url', 'invalidValue', () => {
        enforce(isSectionCtaUrl(cta?.url ?? '')).isTruthy();
      });
    });
  });
});

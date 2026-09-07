import { each, omitWhen, only, staticSuite } from 'vest';

import { ArticleSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { imageConfigValidations, imageStyleValidations } from './image.validations';

export const articleSectionValidations = staticSuite((model: ArticleSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

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
});

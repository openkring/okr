import { only, staticSuite } from 'vest';

import { GallerySection } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const gallerySectionValidations = staticSuite((model: GallerySection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

    // tbd: images: ImageConfig[]
    // tbd: display: ImageDisplayConfig
    // tbd: action: ImageActionConfig

});

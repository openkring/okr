import { omitWhen, only, staticSuite } from 'vest';

import { ArticleSection, ImageActionType } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { booleanValidations, categoryValidations, numberValidations, stringValidations } from '@bk2/shared-util-core';

export const articleSectionValidations = staticSuite((model: ArticleSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

  // image: ImageConfig
  omitWhen(!model.properties?.image, () => {
    stringValidations('label', model.properties?.image.label);
    stringValidations('url', model.properties?.image.url);
    stringValidations('actionUrl', model.properties?.image.actionUrl);
    stringValidations('altText', model.properties?.image.altText);
    stringValidations('overlay', model.properties?.image.overlay);
  });
  // imageStyle: ImageStyle
  omitWhen(!model.properties?.imageStyle, () => {
    stringValidations('imgIxParams', model.properties?.imageStyle.imgIxParams);
    stringValidations('width', model.properties?.imageStyle.width);
    stringValidations('height', model.properties?.imageStyle.height);
    stringValidations('sizes', model.properties?.imageStyle.sizes);
    stringValidations('border', model.properties?.imageStyle.border);
    stringValidations('borderRadius', model.properties?.imageStyle.borderRadius);
    booleanValidations('isThumbnail', model.properties?.imageStyle.isThumbnail);
    stringValidations('slot', model.properties?.imageStyle.slot);   // tbd: validate against Slot enum
    booleanValidations('fill', model.properties?.imageStyle.fill);
    booleanValidations('hasPriority', model.properties?.imageStyle.hasPriority);
    categoryValidations('action', model.properties?.imageStyle.action, ImageActionType);
    numberValidations('zoomFactor', model.properties?.imageStyle.zoomFactor, true, 0, 10);
  });
});

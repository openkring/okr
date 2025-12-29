import { only, staticSuite } from 'vest';

import { LONG_NAME_LENGTH } from '@bk2/shared-constants';
import { AlbumSection, AlbumStyle, GalleryEffect, ImageActionType } from '@bk2/shared-models';
import { booleanValidations, categoryValidations, numberValidations, stringValidations } from '@bk2/shared-util-core';

import { baseSectionValidations } from './base-section.validations';


export const albumSectionValidations = staticSuite((model: AlbumSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

    stringValidations('directory', model.properties?.directory, LONG_NAME_LENGTH);
    categoryValidations('albumStyle', model.properties?.albumStyle, AlbumStyle);
    booleanValidations('recursive', model.properties?.recursive, false);
    booleanValidations('showVideos', model.properties?.showVideos, false);
    booleanValidations('showStreamingVideos', model.properties?.showStreamingVideos, false);
    booleanValidations('showDocs', model.properties?.showDocs, false);
    booleanValidations('showPdfs', model.properties?.showPdfs, false);
    categoryValidations('effect', model.properties?.effect, GalleryEffect);
  
    // ImageStyle
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

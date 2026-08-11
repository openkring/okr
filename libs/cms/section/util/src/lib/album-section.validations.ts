import { only, staticSuite } from 'vest';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { AlbumSection, GalleryEffect, ImageActionType } from '@okr/shared-models';
import { booleanValidations, categoryValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

import { baseSectionValidations } from './base-section.validations';


export const albumSectionValidations = staticSuite((model: AlbumSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

    stringValidations('folder', model.properties?.folder, LONG_NAME_LENGTH);
    stringValidations('albumStyle', model.properties?.albumStyle);
    booleanValidations('showVideos', model.properties?.showVideos, false);
    booleanValidations('showStreamingVideos', model.properties?.showStreamingVideos, false);
    booleanValidations('showDocs', model.properties?.showDocs, false);
    booleanValidations('showPdfs', model.properties?.showPdfs, false);
    categoryValidations('effect', model.properties?.effect, GalleryEffect);
  
    // ImageStyle — guard with ?. as older stored sections may lack imageStyle
    stringValidations('imgIxParams', model.properties?.imageStyle?.imgIxParams);
    stringValidations('width', model.properties?.imageStyle?.width);
    stringValidations('height', model.properties?.imageStyle?.height);
    stringValidations('sizes', model.properties?.imageStyle?.sizes);
    stringValidations('border', model.properties?.imageStyle?.border);
    stringValidations('borderRadius', model.properties?.imageStyle?.borderRadius);
    booleanValidations('isThumbnail', model.properties?.imageStyle?.isThumbnail);
    stringValidations('slot', model.properties?.imageStyle?.slot);   // tbd: validate against Slot enum
    booleanValidations('fill', model.properties?.imageStyle?.fill);
    booleanValidations('hasPriority', model.properties?.imageStyle?.hasPriority);
    categoryValidations('action', model.properties?.imageStyle?.action, ImageActionType);
    numberValidations('zoomFactor', model.properties?.imageStyle?.zoomFactor, true, 0, 10);
});

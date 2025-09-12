import { DeepRequired } from 'ngx-vest-forms';
import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { Image, ImageType } from '@bk2/shared-models';
import { stringValidations } from '@bk2/shared-util-core';

export const imageConfigFormModelShape: DeepRequired<Image> = {
    imageLabel: '',
    imageType: ImageType.Image,
    url: '',
    actionUrl: '',
    altText: '',
    imageOverlay: '',
    fill: true,
    hasPriority: true,
    imgIxParams: '',
    width: 160,
    height: 90,
    sizes: '(max-width: 1240px) 50vw, 300px',
    borderRadius: 0,
    imageAction: 0,
    zoomFactor: 2,
    isThumbnail: false,
    slot: 'none'
};


export const imageConfigValidations = staticSuite((model: Image, field?: string) => {
  if (field) only(field);

  stringValidations('imageLabel', model.imageLabel, SHORT_NAME_LENGTH);
  stringValidations('imageOverlay', model.imageOverlay, SHORT_NAME_LENGTH);
  stringValidations('altText', model.altText, SHORT_NAME_LENGTH);

});

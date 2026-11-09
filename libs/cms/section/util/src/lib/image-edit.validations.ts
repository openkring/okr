import { staticSuite } from 'vest';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { ImageConfig, ImageType } from '@okr/shared-models';
import { categoryValidations, imageUrlValidations, stringValidations } from '@okr/shared-util-core';

/** the longest image attribution (Bildquelle) the edit form accepts */
export const IMAGE_CREDIT_LENGTH = 150;
/** the longest caption (Untertitel) the edit form accepts */
export const IMAGE_CAPTION_LENGTH = LONG_NAME_LENGTH;

/**
 * Validates one image in the image edit modal (Bild-Konfiguration bearbeiten).
 * Field names are the bare ImageConfig keys the form binds to. The url goes through
 * imageUrlValidations, which allows the legacy absolute imgix urls (https://…).
 * Text fields missing on older stored images count as empty: stringValidations rejects undefined,
 * which would otherwise hide the save banner with no visible reason.
 */
export const imageEditValidations = staticSuite((model: ImageConfig) => {
  stringValidations('label', model.label ?? '');
  imageUrlValidations('url', model.url ?? '');
  stringValidations('actionUrl', model.actionUrl ?? '');
  stringValidations('altText', model.altText ?? '');
  stringValidations('overlay', model.overlay ?? '', IMAGE_CAPTION_LENGTH);
  stringValidations('credit', model.credit ?? '', IMAGE_CREDIT_LENGTH);
  categoryValidations('type', model.type, ImageType);
});

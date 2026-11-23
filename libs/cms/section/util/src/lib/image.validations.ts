import { omitWhen } from 'vest';

import { ImageActionType, ImageConfig, ImageStyle, ImageType } from '@okr/shared-models';
import { booleanValidations, categoryValidations, imageUrlValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

/**
 * Validates one ImageConfig. `prefix` is the field-name prefix the form binds to, e.g.
 * `images[0]` for a multi slot or `logo` / `hero` for a single one.
 * The url is checked with imageUrlValidations (not urlValidations): an image url is rendered
 * through imgix, so a leading '/' — which urlValidations allows for navigation targets — is a
 * 'key' and would silently render as an empty image.
 */
export function imageConfigValidations(prefix: string, image: ImageConfig): void {
  stringValidations(`${prefix}.label`, image.label);
  categoryValidations(`${prefix}.type`, image.type, ImageType);
  imageUrlValidations(`${prefix}.url`, image.url);
  stringValidations(`${prefix}.altText`, image.altText);
}

/**
 * Validates the shared ImageStyle block of the article, hero and slider sections.
 * `prefix` (default none) is put before every field name, e.g. `blocks.b1.imageStyle.`.
 * Callers wrap this in their own omitWhen: older stored sections may lack `imageStyle`.
 */
export function imageStyleValidations(imageStyle: ImageStyle | undefined, prefix = ''): void {
  stringValidations(`${prefix}imgIxParams`, imageStyle?.imgIxParams);
  stringValidations(`${prefix}width`, imageStyle?.width);
  stringValidations(`${prefix}height`, imageStyle?.height);
  stringValidations(`${prefix}sizes`, imageStyle?.sizes);
  stringValidations(`${prefix}border`, imageStyle?.border);
  stringValidations(`${prefix}borderRadius`, imageStyle?.borderRadius);
  booleanValidations(`${prefix}isThumbnail`, imageStyle?.isThumbnail);
  stringValidations(`${prefix}slot`, imageStyle?.slot);   // tbd: validate against Slot enum
  booleanValidations(`${prefix}fill`, imageStyle?.fill);
  booleanValidations(`${prefix}hasPriority`, imageStyle?.hasPriority);
  categoryValidations(`${prefix}action`, imageStyle?.action, ImageActionType);
  numberValidations(`${prefix}zoomFactor`, imageStyle?.zoomFactor, true, 0, 10);
}

/**
 * Validates a single, optional image slot (hero's `logo` / `hero`).
 * omitWhen always runs its callback, so the slot is guarded before its fields are read.
 */
export function optionalImageSlotValidations(prefix: string, image: ImageConfig | undefined): void {
  omitWhen(!image, () => {
    imageConfigValidations(prefix, (image ?? {}) as ImageConfig);
  });
}

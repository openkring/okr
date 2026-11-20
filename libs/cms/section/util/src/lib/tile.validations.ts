import { enforce, omitWhen, staticSuite, test } from 'vest';

import { COMMENT_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { TILE_TONES, TileItem, TileVariant } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

import { isSectionCtaUrl } from './section-cta.util';

/** caps of the typed tile fields; the tile form binds its [maxLength] to these very constants */
export const TILE_VALUE_LENGTH = NAME_LENGTH;
export const TILE_TITLE_LENGTH = LONG_NAME_LENGTH;
export const TILE_TEXT_LENGTH = COMMENT_LENGTH;
export const TILE_LINK_LABEL_LENGTH = NAME_LENGTH;
export const TILE_URL_LENGTH = URL_LENGTH;
export const TILE_IMAGE_URL_LENGTH = URL_LENGTH;
/** `#RRGGBB` */
export const TILE_COLOR_LENGTH = 7;

/**
 * Validates one tile in the tile edit modal. Field names are the bare TileItem keys the form binds to.
 * A stat tile needs its value, a card its title. The icon comes from the icon picker and is not capped.
 * Fields missing on older stored tiles count as empty.
 */
export const tileValidations = staticSuite((model: TileItem, variant: TileVariant) => {
  stringValidations('value', model.value ?? '', TILE_VALUE_LENGTH);
  stringValidations('title', model.title ?? '', TILE_TITLE_LENGTH);
  stringValidations('text', model.text ?? '', TILE_TEXT_LENGTH);
  stringValidations('linkLabel', model.linkLabel ?? '', TILE_LINK_LABEL_LENGTH);
  stringValidations('url', model.url ?? '', TILE_URL_LENGTH);
  stringValidations('imageUrl', model.imageUrl ?? '', TILE_IMAGE_URL_LENGTH);

  omitWhen(variant !== 'stat', () => {
    test('value', 'required', () => {
      enforce(model.value?.trim()).isNotEmpty();
    });
  });
  omitWhen(variant === 'stat', () => {
    test('title', 'required', () => {
      enforce(model.title?.trim()).isNotEmpty();
    });
  });
  omitWhen(!model.url?.trim(), () => {
    test('url', 'invalidValue', () => {
      enforce(isSectionCtaUrl(model.url ?? '')).isTruthy();
    });
  });
  stringValidations('color', model.color ?? '', TILE_COLOR_LENGTH);
  omitWhen(!model.color?.trim(), () => {
    test('color', 'invalidValue', () => {
      enforce(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(model.color?.trim() ?? '')).isTruthy();
    });
  });
  test('tone', 'invalidValue', () => {
    enforce((TILE_TONES as readonly string[]).includes(model.tone ?? 'primary')).isTruthy();
  });
});

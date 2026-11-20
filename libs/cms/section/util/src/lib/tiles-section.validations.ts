import { each, enforce, omitWhen, staticSuite, test } from 'vest';

import { TILE_LAYOUTS, TILE_SOURCES, TilesSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { tilesColumns } from './tiles-config.util';
import { isSectionCtaUrl } from './section-cta.util';

/** Field name of a tile field, so the error note shows under the very tile that is wrong. */
export function tilesItemField(index: number, name: string): string {
  return `tiles.i${index}.${name}`;
}

/** the link line of a group card («mehr …») */
export const TILES_LINK_LABEL_LENGTH = 40;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const tilesSectionValidations = staticSuite((model: TilesSection) => {
  baseSectionValidations(model);
  const config = model.properties;
  const fromGroups = config?.source === 'groups';

  // source and layout are selectors: membership only, absent = the default
  omitWhen(config?.source === undefined, () => {
    test('tiles.source', 'invalidValue', () => {
      enforce((TILE_SOURCES as readonly string[]).includes(config?.source ?? '')).isTruthy();
    });
  });
  omitWhen(config?.layout === undefined, () => {
    test('tiles.layout', 'invalidValue', () => {
      enforce((TILE_LAYOUTS as readonly string[]).includes(config?.layout ?? '')).isTruthy();
    });
  });
  omitWhen(!config?.linkLabel, () => {
    test('tiles.linkLabel', 'maxLength', () => {
      enforce((config?.linkLabel ?? '').length).lessThanOrEquals(TILES_LINK_LABEL_LENGTH);
    });
  });

  test('tiles.columns', 'invalidValue', () => {
    // legacy docs lack `columns`: undefined falls back to the default, a set value must be 1-4
    const cols = config?.columns ?? tilesColumns(undefined);
    enforce(Number.isInteger(cols) && cols >= 1 && cols <= 4).isTruthy();
  });

  // with source 'groups' the stored items are not shown, so they never block saving
  each(fromGroups ? [] : config?.items ?? [], (item, i) => {
    omitWhen(!item?.color, () => {
      test(tilesItemField(i, 'color'), 'invalidValue', () => {
        enforce(HEX.test(item?.color ?? '')).isTruthy();
      });
    });
    omitWhen(config?.variant !== 'stat', () => {
      test(tilesItemField(i, 'value'), 'required', () => {
        enforce(item?.value?.trim()).isNotEmpty();
      });
    });
    omitWhen(config?.variant === 'stat', () => {
      test(tilesItemField(i, 'title'), 'required', () => {
        enforce(item?.title?.trim()).isNotEmpty();
      });
    });
    omitWhen(!item?.url?.trim(), () => {
      test(tilesItemField(i, 'url'), 'invalidValue', () => {
        enforce(isSectionCtaUrl(item.url ?? '')).isTruthy();
      });
    });
  });
});

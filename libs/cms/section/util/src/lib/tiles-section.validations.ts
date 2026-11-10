import { each, enforce, omitWhen, staticSuite, test } from 'vest';

import { TilesSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { tilesColumns } from './tiles-config.util';
import { isSectionCtaUrl } from './section-cta.util';

/** Field name of a tile field, so the error note shows under the very tile that is wrong. */
export function tilesItemField(index: number, name: string): string {
  return `tiles.i${index}.${name}`;
}

export const tilesSectionValidations = staticSuite((model: TilesSection) => {
  baseSectionValidations(model);
  const config = model.properties;

  test('tiles.columns', 'invalidValue', () => {
    // legacy docs lack `columns`: undefined falls back to the default, a set value must be 1-4
    const cols = config?.columns ?? tilesColumns(undefined);
    enforce(Number.isInteger(cols) && cols >= 1 && cols <= 4).isTruthy();
  });

  each(config?.items ?? [], (item, i) => {
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

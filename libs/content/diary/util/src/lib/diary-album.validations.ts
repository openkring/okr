import { enforce, omitWhen, staticSuite, test } from 'vest';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { DiaryAlbumModel } from '@okr/shared-models';

const V = '@content/diary/feature.validation.';

/** camelCase event slug as `eventSlug` produces it; an empty slug must fail too. */
const SLUG_PATTERN = /^[a-z][A-Za-z0-9]*$/;

/** What the trip form edits; the suite also accepts a whole `TripModel`. */
export interface DiaryTripFields {
  name: string;
  startDate: string;
  endDate: string;
}

/**
 * Album: the title is always required; an event needs a slug, a person/location album needs the
 * linked avatar (`ref.key`). The slug and the ref are generated/picked values, so they carry no
 * length cap.
 */
export const diaryAlbumValidations = staticSuite((model: DiaryAlbumModel) => {
  test('title', V + 'titleRequired', () => {
    enforce(model.title ?? '').isNotBlank();
  });
  test('title', 'tooLong', () => {
    enforce(model.title ?? '').shorterThanOrEquals(LONG_NAME_LENGTH);
  });

  omitWhen(model.kind !== 'event', () => {
    test('slug', V + 'slugInvalid', () => {
      enforce(SLUG_PATTERN.test(model.slug ?? '')).isTruthy();
    });
  });
  omitWhen(model.kind === 'event', () => {
    test('ref', V + 'refMissing', () => {
      enforce(model.ref?.key ?? '').isNotBlank();
    });
  });
});

/** Trip: name, both dates required, start not after end (reported on `endDate`). */
export const diaryTripValidations = staticSuite((model: DiaryTripFields) => {
  test('name', V + 'nameRequired', () => {
    enforce(model.name ?? '').isNotBlank();
  });
  test('name', 'tooLong', () => {
    enforce(model.name ?? '').shorterThanOrEquals(LONG_NAME_LENGTH);
  });
  test('startDate', V + 'dateRequired', () => {
    enforce(model.startDate ?? '').isNotBlank();
  });
  test('endDate', V + 'dateRequired', () => {
    enforce(model.endDate ?? '').isNotBlank();
  });
  omitWhen(!model.startDate || !model.endDate, () => {
    test('endDate', V + 'dateRangeInvalid', () => {
      enforce(model.startDate <= model.endDate).isTruthy();
    });
  });
});

import { enforce, staticSuite, test } from 'vest';

import { JournalTrackSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

/** A journal track section only refers to a track of the journal (`properties.track.trackKey`); it must name one. */
export const journalTrackSectionValidations = staticSuite((model: JournalTrackSection) => {
  baseSectionValidations(model);

  test('trackKey', '@cms/section/feature.validation.trackRequired', () => {
    const trackKey = model.properties?.track?.trackKey;
    enforce(typeof trackKey === 'string' && trackKey.length > 0).isTruthy();
  });
});

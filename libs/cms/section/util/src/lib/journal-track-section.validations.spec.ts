import { describe, expect, it } from 'vitest';

import { JOURNAL_TRACK_SECTION_SHAPE, JournalTrackSection } from '@okr/shared-models';

import { journalTrackSectionValidations } from './journal-track-section.validations';
import { getSectionValidationSuite } from './section-validation-registry';

const withKey = (trackKey: unknown) =>
  ({ ...JOURNAL_TRACK_SECTION_SHAPE, properties: { track: { trackKey } } }) as unknown as JournalTrackSection;

describe('journalTrackSectionValidations', () => {
  it('requires a chosen track: a fresh section has none', () => {
    expect(journalTrackSectionValidations(withKey('')).hasErrors('trackKey')).toBe(true);
  });

  it('flags a missing or non-string key', () => {
    expect(journalTrackSectionValidations(withKey(undefined)).hasErrors('trackKey')).toBe(true);
    expect(journalTrackSectionValidations(withKey(42)).hasErrors('trackKey')).toBe(true);
  });

  it('accepts a section that names a track', () => {
    expect(journalTrackSectionValidations(withKey('trk__j1__abc')).hasErrors('trackKey')).toBe(false);
  });

  it('is the suite the registry returns for a track section', () => {
    expect(getSectionValidationSuite('track')(withKey('')).hasErrors('trackKey')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { WeatherSection } from '@okr/shared-models';

import { MAP_MAX_LOCATIONS, MAP_MIN_LOCATIONS, weatherSectionValidations } from './weather-section.validations';

/**
 * Every message here is a BLANK vest key. `error-note.ts` resolves a blank key as
 * `validation.<key>` from the app's MAIN bundle — so each of these must exist under
 * `validation` in each app's `src/assets/i18n/{de,en,fr,es,it}.json`, all seven apps, all five
 * languages. A key that is missing there renders as a red field with NO text: the suite is
 * working, the message is simply not found, and nothing fails.
 *
 * That is exactly how these four shipped broken. This spec pins the key names so a rename
 * cannot silently walk away from the bundles again — it cannot see the bundles themselves
 * (they live in private submodules a non-member does not check out), so the bundle side stays
 * a manual step. If you rename a key here, grep the 35 bundle files for the old one.
 */
const EXPECTED_MESSAGE_KEYS = [
  'weatherVariant', 'weatherLocationRequired', 'weatherLocationCount', 'weatherDaysRange',
];

const section = (properties: Partial<WeatherSection['properties']>): WeatherSection => ({
  okey: 'k', type: 'weather', state: 'published', name: 'n', title: 't', subTitle: '',
  index: '', color: 0, colSize: '12', roleNeeded: 'registered', isArchived: false,
  content: {} as WeatherSection['content'], notes: '', tags: '', tenants: ['t1'],
  properties: { variant: 'day-horizontal', locationKey: 'loc1', ...properties },
} as WeatherSection);

/** The message strings vest attached to a field, across all its failing tests. */
const messagesFor = (model: WeatherSection, field: string): string[] =>
  weatherSectionValidations(model).getErrors()[field] ?? [];

describe('weatherSectionValidations — message keys', () => {
  it('emits a message for a missing location', () => {
    expect(messagesFor(section({ locationKey: '' }), 'locationKey'))
      .toContain('weatherLocationRequired');
  });

  it('emits a message for an unknown variant', () => {
    expect(messagesFor(section({ variant: 'nonsense' as never }), 'variant'))
      .toContain('weatherVariant');
  });

  it('emits a message when the map has too few or too many locations', () => {
    const tooFew = Array.from({ length: MAP_MIN_LOCATIONS - 1 }, (_, i) => 'l' + i);
    const tooMany = Array.from({ length: MAP_MAX_LOCATIONS + 1 }, (_, i) => 'l' + i);
    expect(messagesFor(section({ variant: 'map', locationKeys: tooFew }), 'locationKeys'))
      .toContain('weatherLocationCount');
    expect(messagesFor(section({ variant: 'map', locationKeys: tooMany }), 'locationKeys'))
      .toContain('weatherLocationCount');
  });

  it('emits a message for a day count outside the range', () => {
    expect(messagesFor(section({ days: 0 }), 'days')).toContain('weatherDaysRange');
    expect(messagesFor(section({ days: 8 }), 'days')).toContain('weatherDaysRange');
  });

  it('uses no @-prefixed key — those need a full scope path and these have none', () => {
    // '@roleTypeMustBeRoleName' in base-section.validations was exactly this mistake.
    for (const key of EXPECTED_MESSAGE_KEYS) expect(key.startsWith('@')).toBe(false);
  });
});

describe('weatherSectionValidations — accepts valid input', () => {
  it('passes a plain day widget with a location', () => {
    expect(messagesFor(section({}), 'locationKey')).toEqual([]);
    expect(messagesFor(section({}), 'variant')).toEqual([]);
  });

  it('does not demand a single location from a map — it brings its own list', () => {
    const map = section({ variant: 'map', locationKey: '', locationKeys: ['a', 'b'] });
    expect(messagesFor(map, 'locationKey')).toEqual([]);
    expect(messagesFor(map, 'locationKeys')).toEqual([]);
  });

  it('treats days as optional — the widget defaults it', () => {
    expect(messagesFor(section({ days: undefined }), 'days')).toEqual([]);
  });
});

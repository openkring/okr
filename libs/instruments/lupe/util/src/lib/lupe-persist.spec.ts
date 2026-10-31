import { describe, expect, it } from 'vitest';

import { DEFAULT_LUPE_SETTINGS } from './lupe.model';
import { restoreLupe, serializeLupe } from './lupe-persist';

describe('lupe persistence', () => {
  it('round-trips the settings', () => {
    expect(restoreLupe(serializeLupe({ zoom: 3.5, torch: true }))).toEqual({ zoom: 3.5, torch: true });
  });

  it('falls back to the defaults on nothing or garbage', () => {
    expect(restoreLupe(null)).toEqual(DEFAULT_LUPE_SETTINGS);
    expect(restoreLupe('{oops')).toEqual(DEFAULT_LUPE_SETTINGS);
    expect(restoreLupe('42')).toEqual(DEFAULT_LUPE_SETTINGS);
  });

  it('repairs invalid fields one by one', () => {
    expect(restoreLupe(JSON.stringify({ zoom: -2, torch: true }))).toEqual({ zoom: 1, torch: true });
    expect(restoreLupe(JSON.stringify({ zoom: 4, torch: 'yes' }))).toEqual({ zoom: 4, torch: false });
  });
});

import { describe, expect, it } from 'vitest';

import { DEFAULT_MAMPF_SETTINGS, parseMampfSettings } from './mampf.settings';

describe('parseMampfSettings', () => {
  it('falls back to defaults for missing or broken storage', () => {
    expect(parseMampfSettings(null)).toEqual(DEFAULT_MAMPF_SETTINGS);
    expect(parseMampfSettings('{not json')).toEqual(DEFAULT_MAMPF_SETTINGS);
    expect(parseMampfSettings('42')).toEqual(DEFAULT_MAMPF_SETTINGS);
  });

  it('keeps valid fields and drops invalid ones one by one', () => {
    expect(parseMampfSettings('{"highScore":1234.7,"muted":true,"dpad":false}'))
      .toEqual({ highScore: 1234, muted: true, dpad: false });
    expect(parseMampfSettings('{"highScore":-5,"muted":"yes","dpad":1}'))
      .toEqual({ highScore: 0, muted: false, dpad: null });
  });
});

import { describe, expect, it } from 'vitest';
import { NEWS_CHANNEL_NAME_MAX_LENGTH, newsChannelValidations } from './news-channel.validations';

const ok = { name: 'Hafen Stäfa', latitude: 0, longitude: 0, orgKey: '', orgName: '' };

describe('newsChannelValidations', () => {
  it('accepts a named channel', () => {
    expect(newsChannelValidations(ok).isValid()).toBe(true);
  });
  it('requires a name', () => {
    expect(newsChannelValidations({ ...ok, name: '  ' }).getErrors('name').length).toBeGreaterThan(0);
  });
  it('caps the name at 80', () => {
    expect(NEWS_CHANNEL_NAME_MAX_LENGTH).toBe(80);
    expect(newsChannelValidations({ ...ok, name: 'x'.repeat(80) }).isValid()).toBe(true);
    expect(newsChannelValidations({ ...ok, name: 'x'.repeat(81) }).getErrors('name').length).toBeGreaterThan(0);
  });
});

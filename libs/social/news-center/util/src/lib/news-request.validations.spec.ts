import { describe, expect, it } from 'vitest';
import { NEWS_REQUEST_NOTE_MAX, newsRequestValidations } from './news-request.validations';

const ok = { segment: 'video', url: 'https://www.youtube.com/@seeclub', note: '' };

describe('newsRequestValidations', () => {
  it('accepts a valid request', () => {
    expect(newsRequestValidations(ok).isValid()).toBe(true);
  });
  it('requires the url', () => {
    expect(newsRequestValidations({ ...ok, url: '' }).getErrors('url').length).toBeGreaterThan(0);
  });
  it('requires http(s) with a host', () => {
    for (const url of ['ftp://x.org/a', 'https://', 'www.example.org', 'javascript:alert(1)', 'https:// x.org']) {
      expect(newsRequestValidations({ ...ok, url }).getErrors('url').length, url).toBeGreaterThan(0);
    }
    expect(newsRequestValidations({ ...ok, url: 'http://example.org/feed' }).isValid()).toBe(true);
  });
  it('caps the note', () => {
    expect(newsRequestValidations({ ...ok, note: 'x'.repeat(NEWS_REQUEST_NOTE_MAX) }).isValid()).toBe(true);
    expect(newsRequestValidations({ ...ok, note: 'x'.repeat(NEWS_REQUEST_NOTE_MAX + 1) }).getErrors('note').length).toBeGreaterThan(0);
  });
  it('only knows the four segments', () => {
    expect(newsRequestValidations({ ...ok, segment: 'radio' }).getErrors('segment').length).toBeGreaterThan(0);
    expect(newsRequestValidations({ ...ok, segment: 'webcam' }).isValid()).toBe(true);
  });
});

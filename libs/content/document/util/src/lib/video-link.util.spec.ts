import { describe, expect, it } from 'vitest';
import { OKR_VIDEO_FIELD, parseVideoLink, readOkrVideo, videoDocKeyOf, videoLink } from './video-link.util';

const O = 'https://app.example.org';

describe('videoLink / parseVideoLink', () => {
  it('round-trips', () => { expect(parseVideoLink(videoLink(O, 'AbC_1'), O)).toBe('AbC_1'); });
  it('accepts a trailing slash and surrounding whitespace', () => {
    expect(parseVideoLink(`  ${O}/video/abc/ \n`, O)).toBe('abc');
  });
  it('rejects another origin', () => { expect(parseVideoLink('https://evil.org/video/abc', O)).toBeUndefined(); });
  it('rejects http vs https', () => { expect(parseVideoLink('http://app.example.org/video/abc', O)).toBeUndefined(); });
  it('rejects a different port', () => { expect(parseVideoLink('https://app.example.org:8443/video/abc', O)).toBeUndefined(); });
  it('rejects extra text around', () => {
    expect(parseVideoLink(`see ${O}/video/abc`, O)).toBeUndefined();
    expect(parseVideoLink(`${O}/video/abc thanks`, O)).toBeUndefined();
  });
  it('rejects query and hash', () => {
    expect(parseVideoLink(`${O}/video/abc?x=1`, O)).toBeUndefined();
    expect(parseVideoLink(`${O}/video/abc#t`, O)).toBeUndefined();
    expect(parseVideoLink(`${O}/video/abc?`, O)).toBeUndefined();
  });
  it('rejects keys with . or / or bad encoding or too long', () => {
    expect(parseVideoLink(`${O}/video/a.b`, O)).toBeUndefined();
    expect(parseVideoLink(`${O}/video/a/b`, O)).toBeUndefined();
    expect(parseVideoLink(`${O}/video/a%2Fb`, O)).toBeUndefined();
    expect(parseVideoLink(`${O}/video/%E0%A4%A`, O)).toBeUndefined();
    expect(parseVideoLink(`${O}/video/${'a'.repeat(65)}`, O)).toBeUndefined();
    expect(parseVideoLink(`${O}/video/`, O)).toBeUndefined();
  });
  it('accepts 64 chars and rejects non-urls', () => {
    expect(parseVideoLink(`${O}/video/${'a'.repeat(64)}`, O)).toBe('a'.repeat(64));
    expect(parseVideoLink('not a url', O)).toBeUndefined();
    expect(parseVideoLink('abc', 'bad origin')).toBeUndefined();
  });
});

describe('readOkrVideo', () => {
  it('reads a valid field', () => {
    expect(readOkrVideo({ [OKR_VIDEO_FIELD]: { docKey: 'k1', tenantId: 't' } })).toEqual({ docKey: 'k1', tenantId: 't' });
  });
  it('rejects non-objects and bad shapes', () => {
    for (const c of [undefined, null, 'x', 5, [], {}, { [OKR_VIDEO_FIELD]: 'x' }, { [OKR_VIDEO_FIELD]: null },
      { [OKR_VIDEO_FIELD]: { tenantId: 't' } }, { [OKR_VIDEO_FIELD]: { docKey: '', tenantId: 't' } },
      { [OKR_VIDEO_FIELD]: { docKey: 'k', tenantId: 5 } }, { [OKR_VIDEO_FIELD]: { docKey: 'k' } }]) {
      expect(readOkrVideo(c)).toBeUndefined();
    }
  });
});

describe('videoDocKeyOf', () => {
  it('prefers the field over the body', () => {
    expect(videoDocKeyOf({ [OKR_VIDEO_FIELD]: { docKey: 'f', tenantId: 't' } }, `${O}/video/b`, O)).toBe('f');
  });
  it('falls back to the body link', () => { expect(videoDocKeyOf({}, `${O}/video/b`, O)).toBe('b'); });
  it('is undefined otherwise', () => { expect(videoDocKeyOf(undefined, 'hello', O)).toBeUndefined(); });
});

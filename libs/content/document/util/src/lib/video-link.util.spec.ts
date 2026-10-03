import { describe, expect, it } from 'vitest';
import { isVideoDocKey, OKR_VIDEO_FIELD, parseVideoLink, readOkrVideo, videoDocKeyOf, videoLink } from './video-link.util';

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

describe('readOkrVideo docKey validation', () => {
  const f = (docKey: string) => readOkrVideo({ [OKR_VIDEO_FIELD]: { docKey, tenantId: 't' } });
  it('rejects unsafe keys', () => {
    for (const k of ['a/b', '..', 'a'.repeat(65), 'a b']) expect(f(k)).toBeUndefined();
  });
  it('accepts a 20-char Firestore id', () => {
    expect(f('AbCdEfGhIjKlMnOpQrSt')).toEqual({ docKey: 'AbCdEfGhIjKlMnOpQrSt', tenantId: 't' });
  });
});

describe('videoDocKeyOf', () => {
  it('prefers the field over the body', () => {
    expect(videoDocKeyOf({ [OKR_VIDEO_FIELD]: { docKey: 'f', tenantId: 't' } }, `${O}/video/b`, O)).toBe('f');
  });
  it('falls back to the body link', () => { expect(videoDocKeyOf({}, `${O}/video/b`, O)).toBe('b'); });
  it('is undefined otherwise', () => { expect(videoDocKeyOf(undefined, 'hello', O)).toBeUndefined(); });
});

describe('reserved ids and several origins (final review)', () => {
  const PUB = 'https://app.seeclub.org';
  it('rejects a reserved __…__ key in a link and in the custom field', () => {
    expect(parseVideoLink(`${O}/video/__a__`, O)).toBeUndefined();
    expect(readOkrVideo({ [OKR_VIDEO_FIELD]: { docKey: '__a__', tenantId: 't' } })).toBeUndefined();
    expect(isVideoDocKey('__a__')).toBe(false);
    expect(isVideoDocKey('__a')).toBe(true);
  });
  it('accepts a link on any of the given origins', () => {
    expect(parseVideoLink(`${PUB}/video/abc`, [O, PUB])).toBe('abc');
    expect(parseVideoLink(`${O}/video/abc`, [O, PUB])).toBe('abc');
    expect(parseVideoLink('https://evil.org/video/abc', [O, PUB])).toBeUndefined();
    expect(videoDocKeyOf({}, `${PUB}/video/b`, [O, PUB])).toBe('b');
  });
  it('never matches a capacitor:// link (opaque origin), even when listed', () => {
    expect(parseVideoLink('capacitor://localhost/video/abc', ['capacitor://localhost', PUB])).toBeUndefined();
  });
});

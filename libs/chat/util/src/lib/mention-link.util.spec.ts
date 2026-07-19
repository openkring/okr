import { describe, expect, it } from 'vitest';
import { extractMentionLocalpart } from './mention-link.util';

describe('extractMentionLocalpart', () => {
  it('extracts the localpart from a matrix.to person mention link', () => {
    expect(extractMentionLocalpart('https://matrix.to/#/@p1:example.org')).toBe('p1');
  });

  it('extracts the localpart when the server part contains a port', () => {
    expect(extractMentionLocalpart('https://matrix.to/#/@anna:example.org:8448')).toBe('anna');
  });

  it('extracts the whole localpart when the user id has no colon (no server part)', () => {
    expect(extractMentionLocalpart('https://matrix.to/#/@p1')).toBe('p1');
  });

  it('returns undefined for a matrix.to room link', () => {
    expect(extractMentionLocalpart('https://matrix.to/#/!roomid:example.org')).toBeUndefined();
  });

  it('returns undefined for an ordinary http(s) link', () => {
    expect(extractMentionLocalpart('https://example.org/some/page')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(extractMentionLocalpart('')).toBeUndefined();
  });

  it('returns undefined when the localpart is empty', () => {
    expect(extractMentionLocalpart('https://matrix.to/#/@:example.org')).toBeUndefined();
  });
});

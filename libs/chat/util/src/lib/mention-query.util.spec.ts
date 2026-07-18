import { describe, expect, it } from 'vitest';
import { findMentionQuery } from './mention-query.util';

describe('findMentionQuery', () => {
  it('returns an empty query right after a lone @', () => {
    expect(findMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('returns the typed prefix', () => {
    expect(findMentionQuery('hallo @ann', 10)).toEqual({ start: 6, query: 'ann' });
  });

  it('keeps matching after the caret moved back into the token', () => {
    expect(findMentionQuery('hallo @anna schmid', 11)).toEqual({ start: 6, query: 'anna' });
  });

  it('uses the last @ when several are present', () => {
    expect(findMentionQuery('@anna und @bob', 14)).toEqual({ start: 10, query: 'bob' });
  });

  it('stops at whitespace — no @ in the current word means no match', () => {
    expect(findMentionQuery('hallo anna', 10)).toBeNull();
  });

  it('ignores an @ that is not at a word start (e.g. an email address)', () => {
    expect(findMentionQuery('mail an anna@example.com', 24)).toBeNull();
  });

  it('matches an @ at the start of a new line', () => {
    expect(findMentionQuery('erste zeile\n@ro', 15)).toEqual({ start: 12, query: 'ro' });
  });

  it('returns null when the caret is before the @', () => {
    expect(findMentionQuery('hallo @anna', 3)).toBeNull();
  });
});

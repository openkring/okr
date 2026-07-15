import { describe, expect, it } from 'vitest';
import { buildMentionContent } from './mention.util';

describe('buildMentionContent', () => {
  it('returns null when there are no mentions and no room', () => {
    expect(buildMentionContent('hello', [], false)).toBeNull();
  });

  it('builds a single person mention with an anchor', () => {
    const result = buildMentionContent(
      'Team @Maria Muster',
      [{ display: 'Maria Muster', userId: '@p1:example.org' }],
      false,
    );
    expect(result).toEqual({
      formatted_body: 'Team <a href="https://matrix.to/#/@p1:example.org">Maria Muster</a>',
      mentions: { user_ids: ['@p1:example.org'] },
    });
  });

  it('handles multiple distinct person mentions', () => {
    const result = buildMentionContent(
      '@Ann Lee and @Bo Ng',
      [
        { display: 'Ann Lee', userId: '@a:example.org' },
        { display: 'Bo Ng', userId: '@b:example.org' },
      ],
      false,
    );
    expect(result?.formatted_body).toBe(
      '<a href="https://matrix.to/#/@a:example.org">Ann Lee</a> and <a href="https://matrix.to/#/@b:example.org">Bo Ng</a>',
    );
    expect(result?.mentions.user_ids).toEqual(['@a:example.org', '@b:example.org']);
  });

  it('dedupes user_ids but keeps every anchor for duplicate persons', () => {
    const result = buildMentionContent(
      'ping @Al @Al',
      [
        { display: 'Al', userId: '@al:example.org' },
        { display: 'Al', userId: '@al:example.org' },
      ],
      false,
    );
    expect(result?.mentions.user_ids).toEqual(['@al:example.org']);
    expect(result?.formatted_body).toBe(
      'ping <a href="https://matrix.to/#/@al:example.org">Al</a> <a href="https://matrix.to/#/@al:example.org">Al</a>',
    );
  });

  it('sets room=true and no formatted_body for a room-only mention', () => {
    expect(buildMentionContent('everyone @room', [], true)).toEqual({
      mentions: { user_ids: [], room: true },
    });
  });

  it('combines room and person mentions', () => {
    const result = buildMentionContent(
      '@room ping @Al',
      [{ display: 'Al', userId: '@al:example.org' }],
      true,
    );
    expect(result?.mentions).toEqual({ user_ids: ['@al:example.org'], room: true });
    expect(result?.formatted_body).toBe(
      '@room ping <a href="https://matrix.to/#/@al:example.org">Al</a>',
    );
  });

  it('HTML-escapes surrounding text and display names', () => {
    const result = buildMentionContent(
      'look <b> @A&B',
      [{ display: 'A&B', userId: '@ab:example.org' }],
      false,
    );
    expect(result?.formatted_body).toBe(
      'look &lt;b&gt; <a href="https://matrix.to/#/@ab:example.org">A&amp;B</a>',
    );
  });
});

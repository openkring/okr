import { describe, expect, it } from 'vitest';
import { buildMentionContent, filterActiveMentions } from './mention.util';

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

describe('filterActiveMentions', () => {
  const al = { personKey: 'P1', display: 'Al Meier' };
  const alan = { personKey: 'P2', display: 'Al Meiers' };

  it('keeps a mention that is still in the text', () => {
    expect(filterActiveMentions('hallo @Al Meier wie gehts', [al])).toEqual([al]);
  });

  it('drops a mention the user deleted from the text', () => {
    expect(filterActiveMentions('hallo wie gehts', [al])).toEqual([]);
  });

  it('does not match a display name that is only a prefix of the typed one', () => {
    expect(filterActiveMentions('hallo @Al Meiers', [al, alan])).toEqual([alan]);
  });

  it('does not match a display name that is only a prefix of a hyphenated surname', () => {
    const anna = { personKey: 'P3', display: 'Anna Meier' };
    expect(filterActiveMentions('hallo @Anna Meier-Muster', [anna])).toEqual([]);
  });

  it('keeps a mention at the very end of the text', () => {
    expect(filterActiveMentions('hallo @Al Meier', [al])).toEqual([al]);
  });

  it('deduplicates by personKey', () => {
    expect(filterActiveMentions('@Al Meier @Al Meier', [al, al])).toEqual([al]);
  });
});

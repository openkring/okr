import { describe, expect, it } from 'vitest';
import { decorateMentionPills, extractMentionLocalpart } from './mention-link.util';

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

describe('decorateMentionPills', () => {
  const avatars: Record<string, string> = { anna: 'https://cdn.example/anna.jpg' };
  const avatarUrlFor = (localpart: string) => avatars[localpart];

  it('replaces a person mention with an avatar + first-name pill', () => {
    const html = 'hallo <a href="https://matrix.to/#/@anna:example.org">Anna Meier</a>!';
    expect(decorateMentionPills(html, avatarUrlFor)).toBe(
      'hallo <a href="https://matrix.to/#/@anna:example.org" class="okr-mention-pill">'
      + '<img class="okr-mention-avatar" src="https://cdn.example/anna.jpg" alt="" />Anna</a>!',
    );
  });

  it('renders a text-only pill when no avatar is cached', () => {
    const html = '<a href="https://matrix.to/#/@bob:example.org">Bob Muster</a>';
    expect(decorateMentionPills(html, avatarUrlFor)).toBe(
      '<a href="https://matrix.to/#/@bob:example.org" class="okr-mention-pill">Bob</a>',
    );
  });

  it('leaves ordinary links and room links untouched', () => {
    const html = '<a href="https://example.org/page">Doku</a> <a href="https://matrix.to/#/!r:example.org">Raum</a>';
    expect(decorateMentionPills(html, avatarUrlFor)).toBe(html);
  });

  it('decorates every mention in a message', () => {
    const html = '<a href="https://matrix.to/#/@anna:example.org">Anna Meier</a> und '
      + '<a href="https://matrix.to/#/@bob:example.org">Bob Muster</a>';
    const result = decorateMentionPills(html, avatarUrlFor);
    expect(result).toContain('>Anna</a>');
    expect(result).toContain('>Bob</a>');
  });

  it('keeps a single-word display name intact', () => {
    const html = '<a href="https://matrix.to/#/@bob:example.org">Bob</a>';
    expect(decorateMentionPills(html, avatarUrlFor)).toContain('>Bob</a>');
  });

  it('escapes the avatar url it injects', () => {
    const html = '<a href="https://matrix.to/#/@x:example.org">X Y</a>';
    const result = decorateMentionPills(html, () => 'https://cdn.example/a.jpg?w=1&h=2"onerror="x');
    expect(result).toContain('&amp;h=2&quot;onerror=&quot;x');
    expect(result).not.toContain('"onerror="x');
  });

  it('returns an empty string unchanged', () => {
    expect(decorateMentionPills('', avatarUrlFor)).toBe('');
  });
});

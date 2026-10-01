import { describe, expect, it } from 'vitest';
import { answerPage, answerResultPage, brandColorOf, commentEmail, DEFAULT_BRAND_COLOR, escapeHtml, eventWhen, invitationEmail, locationLabel, textColorOn } from './mail';

const EVIL = '<script>alert("x")</script> & co';
const base = { appName: 'Seeclub', brandColor: '#009D53', logoUrl: 'https://img.x/logo.png?w=96&fm=png', eventName: EVIL, when: '01.10.2026, 11:00', location: EVIL };

describe('escapeHtml', () => {
  it('escapes the five html characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
  it('treats undefined as empty', () => expect(escapeHtml(undefined)).toBe(''));
});

describe('eventWhen', () => {
  it('joins date and time', () => expect(eventWhen('20261001', '11:00')).toBe('01.10.2026, 11:00'));
  it('omits a missing time', () => expect(eventWhen('20261001', '')).toBe('01.10.2026'));
  it('is empty without a date', () => expect(eventWhen('', '11:00')).toBe(''));
});

describe('locationLabel', () => {
  it('returns the name part before the first @', () => expect(locationLabel('Bootshaus Stäfa@x7Yq2')).toBe('Bootshaus Stäfa'));
  it('returns empty for a bare key without @', () => expect(locationLabel('x7Yq2')).toBe(''));
  it('returns empty for an empty string', () => expect(locationLabel('')).toBe(''));
  it('returns empty for undefined', () => expect(locationLabel(undefined)).toBe(''));
  it('returns empty when the name part is empty', () => expect(locationLabel('@x7Yq2')).toBe(''));
});

describe('brandColorOf', () => {
  it('keeps a valid hex colour, lowercased', () => expect(brandColorOf('#009D53')).toBe('#009d53'));
  it('expands the short form', () => expect(brandColorOf('#0af')).toBe('#00aaff'));
  it('falls back for empty, named or injected values', () => {
    expect(brandColorOf('')).toBe(DEFAULT_BRAND_COLOR);
    expect(brandColorOf(undefined)).toBe(DEFAULT_BRAND_COLOR);
    expect(brandColorOf('red')).toBe(DEFAULT_BRAND_COLOR);
    expect(brandColorOf('#fff;background:url(x)')).toBe(DEFAULT_BRAND_COLOR);
  });
});

describe('textColorOn', () => {
  it('puts white on a dark brand', () => {
    expect(textColorOn('#009D53')).toBe('#ffffff');
    expect(textColorOn('#002a7e')).toBe('#ffffff');
  });
  it('puts dark text on a light brand', () => {
    expect(textColorOn('#8ed698')).toBe('#1f2328');
    expect(textColorOn('#ffffff')).toBe('#1f2328');
  });
});

describe('invitationEmail', () => {
  const mail = invitationEmail({ ...base, inviterName: EVIL, note: `${EVIL}\nzweite Zeile`, respondUrl: 'https://f/a?i=1&s=sig' });

  it('never contains raw user html', () => expect(mail.html).not.toContain('<script>'));
  it('keeps the text, escaped', () => expect(mail.html).toContain('&lt;script&gt;'));
  it('has one «Antworten» button to the answer page, and no direct answer links', () => {
    expect(mail.html).toContain('>Antworten</a>');
    expect(mail.html).toContain('href="https://f/a?i=1&amp;s=sig"');
    expect(mail.html).not.toContain('ich nehme');
    expect(mail.html.match(/<a /g)).toHaveLength(1);
  });
  it('opens with the tenant banner: brand colour, logo, app name', () => {
    expect(mail.html).toContain('bgcolor="#009d53"');
    expect(mail.html).toContain('src="https://img.x/logo.png?w=96&amp;fm=png"');
    expect(mail.html.indexOf('Seeclub</span>')).toBeLessThan(mail.html.indexOf('lädt dich ein'));
  });
  it('colours the button with the brand', () => expect(mail.html).toContain('background:#009d53;color:#ffffff;'));
  it('omits the logo when there is none', () => {
    expect(invitationEmail({ ...base, logoUrl: '', inviterName: 'B', note: '', respondUrl: 'https://f' }).html).not.toContain('<img');
  });
  it('keeps line breaks of the note', () => expect(mail.html).toContain('<br>zweite Zeile'));
  it('puts the event into the subject, unescaped (subject is plain text)', () => expect(mail.subject).toBe(`Einladung: ${EVIL}, 01.10.2026, 11:00`));
});

describe('commentEmail', () => {
  const mail = commentEmail({ ...base, authorName: 'Bruno Kaiser', comment: EVIL, eventUrl: 'https://app.x/e' });
  it('escapes the comment', () => expect(mail.html).not.toContain('<script>'));
  it('names the author in the subject', () => expect(mail.subject).toBe(`Bruno Kaiser hat ${EVIL} kommentiert`));
  it('links the event', () => expect(mail.html).toContain('href="https://app.x/e"'));
});

describe('answer pages', () => {
  const page = { ...base, postUrl: 'https://f/invitationAnswer', invitationKey: 'inv"1', signature: 'sig' };

  it('answer page posts both answers with the signature and escapes the event', () => {
    const html = answerPage({ ...page, answers: ['accept', 'decline'] });
    expect(html).toContain('method="post"');
    expect(html).toContain('action="https://f/invitationAnswer"');
    expect(html).toContain('name="a" value="accept"');
    expect(html).toContain('name="a" value="decline"');
    expect(html).toContain('Ich nehme teil');
    expect(html).toContain('Ich nehme nicht teil');
    expect(html).toContain('name="s" value="sig"');
    expect(html).toContain('value="inv&quot;1"');
    expect(html).not.toContain('<script>alert');
  });
  it('answer page starts with the tenant banner', () => {
    const html = answerPage({ ...page, answers: ['accept', 'decline'] });
    expect(html).toContain('bgcolor="#009d53"');
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('Nimmst du teil?'));
  });
  it('offers only the signed answer of a legacy link', () => {
    const html = answerPage({ ...page, answers: ['decline'] });
    expect(html).not.toContain('value="accept"');
    expect(html).toContain('value="decline"');
  });
  it('mentions an earlier answer', () => {
    expect(answerPage({ ...page, answers: ['accept', 'decline'], state: 'accepted' })).toContain('bereits zugesagt');
    expect(answerPage({ ...page, answers: ['accept', 'decline'], state: 'pending' })).not.toContain('bereits');
  });
  it('result page escapes title and message and carries the banner', () => {
    const html = answerResultPage({ appName: 'Seeclub', brandColor: '#009D53', title: EVIL, message: EVIL });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('bgcolor="#009d53"');
  });
});

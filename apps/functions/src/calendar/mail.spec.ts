import { describe, expect, it } from 'vitest';
import { answerConfirmPage, answerResultPage, commentEmail, escapeHtml, eventWhen, invitationEmail, locationLabel } from './mail';

const EVIL = '<script>alert("x")</script> & co';
const base = { appName: 'Seeclub', eventName: EVIL, when: '01.10.2026, 11:00', location: EVIL };

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

describe('invitationEmail', () => {
  const mail = invitationEmail({ ...base, inviterName: EVIL, note: `${EVIL}\nzweite Zeile`, eventUrl: 'https://app.x/e', acceptUrl: 'https://f/a?i=1&a=accept', declineUrl: 'https://f/a?i=1&a=decline' });

  it('never contains raw user html', () => expect(mail.html).not.toContain('<script>'));
  it('keeps the text, escaped', () => expect(mail.html).toContain('&lt;script&gt;'));
  it('has both answer buttons and the event link', () => {
    expect(mail.html).toContain('ich nehme teil');
    expect(mail.html).toContain('ich nehme nicht teil');
    expect(mail.html).toContain('href="https://f/a?i=1&amp;a=accept"');
    expect(mail.html).toContain('href="https://app.x/e"');
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
  it('confirm page posts the signed answer and escapes the event', () => {
    const html = answerConfirmPage({ ...base, answer: 'decline', postUrl: 'https://f/invitationAnswer', invitationKey: 'inv"1', signature: 'sig' });
    expect(html).toContain('method="post"');
    expect(html).toContain('action="https://f/invitationAnswer"');
    expect(html).toContain('name="a" value="decline"');
    expect(html).toContain('value="inv&quot;1"');
    expect(html).toContain('Absage bestätigen');
    expect(html).not.toContain('<script>alert');
  });
  it('result page escapes title and message', () => {
    const html = answerResultPage({ appName: 'Seeclub', title: EVIL, message: EVIL });
    expect(html).not.toContain('<script>alert');
  });
});

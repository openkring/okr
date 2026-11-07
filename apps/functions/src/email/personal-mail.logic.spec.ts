import { describe, expect, it } from 'vitest';
import { ANSWER_URL_PLACEHOLDER, answerBlockHtml, fillAnswerUrl, parseCaleventKeys, personalEntries, personalOutcome, sendableEventRefusal, sendErrorCode } from './personal-mail.logic';

describe('personalEntries', () => {
  const urlFor = (key: string) => `https://x/?p=${key}`;

  it('keeps two persons with the same address apart', () => {
    const emails = new Map([['p1', 'a@x.ch'], ['p2', 'a@x.ch']]);
    const entries = personalEntries(['p1', 'p2'], emails, urlFor);
    expect(entries).toHaveLength(2);
    expect(entries[0].answerUrl).not.toBe(entries[1].answerUrl);
  });

  it('skips a person without favEmail', () => {
    const emails = new Map([['p1', 'a@x.ch']]);
    expect(personalEntries(['p0', 'p1'], emails, urlFor)).toEqual([{ to: 'a@x.ch', answerUrl: 'https://x/?p=p1' }]);
  });
});

describe('answerBlockHtml', () => {
  it('contains the url and escapes names', () => {
    const html = answerBlockHtml('https://x/?m=1&p=2', [{ name: '<b>GV</b>', when: '01.12.2026, 19:00' }]);
    expect(html).toContain('https://x/?m=1&amp;p=2');
    expect(html).toContain('&lt;b&gt;GV&lt;/b&gt;');
    expect(html).not.toContain('<b>GV');
    expect(html).toContain('01.12.2026, 19:00 · ');
    expect(html).toContain('An- oder abmelden');
  });
});

describe('personalOutcome', () => {
  it('reports partial failure', () => {
    expect(personalOutcome(248, 2)).toEqual({ state: 'sent', error: '2 von 250 Mails konnten nicht gesendet werden.' });
    expect(personalOutcome(0, 3)).toEqual({ state: 'failed', error: '3 von 3 Mails konnten nicht gesendet werden.' });
    expect(personalOutcome(5, 0)).toEqual({ state: 'sent' });
  });
});

describe('parseCaleventKeys', () => {
  it('treats undefined as none and dedupes', () => {
    expect(parseCaleventKeys(undefined)).toEqual([]);
    expect(parseCaleventKeys(['a', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('rejects 21 keys and a non-list', () => {
    expect(() => parseCaleventKeys(Array.from({ length: 21 }, (_, i) => `k${i}`))).toThrow();
    expect(() => parseCaleventKeys(5)).toThrow();
    expect(() => parseCaleventKeys([1])).toThrow();
  });
});

describe('fillAnswerUrl', () => {
  it('replaces every occurrence in both halves and escapes the url in html only', () => {
    const rendered = { html: `<a href="${ANSWER_URL_PLACEHOLDER}">x</a><a href="${ANSWER_URL_PLACEHOLDER}">y</a>`, text: `x (${ANSWER_URL_PLACEHOLDER}) y ${ANSWER_URL_PLACEHOLDER}` };
    const out = fillAnswerUrl(rendered, 'https://x/?m=1&p=2');
    expect(out.html).toBe('<a href="https://x/?m=1&amp;p=2">x</a><a href="https://x/?m=1&amp;p=2">y</a>');
    expect(out.text).toBe('x (https://x/?m=1&p=2) y https://x/?m=1&p=2');
  });

  it('leaves a missing text alone', () => {
    expect(fillAnswerUrl({ html: ANSWER_URL_PLACEHOLDER }, 'u')).toEqual({ html: 'u' });
  });
});

describe('sendableEventRefusal', () => {
  const ok = { tenants: ['t'], startDate: '20261210' };
  it('refuses other tenant, missing, archived, past, cancelled and locked', () => {
    expect(sendableEventRefusal({ ...ok, tenants: ['o'] }, 't', '20261107')).toBe('eventGone');
    expect(sendableEventRefusal(undefined, 't', '20261107')).toBe('eventGone');
    expect(sendableEventRefusal({ ...ok, isArchived: true }, 't', '20261107')).toBe('eventGone');
    expect(sendableEventRefusal({ ...ok, startDate: '20261001' }, 't', '20261107')).toBe('past');
    expect(sendableEventRefusal({ ...ok, state: 'cancelled' }, 't', '20261107')).toBe('cancelled');
    expect(sendableEventRefusal({ ...ok, isLocked: true }, 't', '20261107')).toBe('locked');
  });

  it('accepts a fine event', () => {
    expect(sendableEventRefusal(ok, 't', '20261107')).toBeUndefined();
  });
});

describe('sendErrorCode', () => {
  it('names class and status, never the message', () => {
    expect(sendErrorCode(new Error('Mailtrap API error 422: a@x.ch bad'))).toBe('Error 422');
    expect(sendErrorCode(Object.assign(new Error('boom a@x.ch'), { code: 'EENVELOPE' }))).toBe('Error EENVELOPE');
    expect(sendErrorCode(undefined)).toBe('Error');
  });
});

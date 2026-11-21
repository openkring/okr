import { describe, expect, it } from 'vitest';
import {
  ANSWER_URL_PLACEHOLDER, answerBlockHtml, chunkPersonal, deadlineOutcome, deadlineReached, fillAnswerUrl, fillUrl, hasPlaceholder, MAX_PERSONAL_RECIPIENTS,
  parseCaleventKeys, PERSONAL_DEADLINE_MS, personalEntries, personalOutcome, refusedEventMessage, sendableEventRefusal, sendErrorCode,
  UNSUBSCRIBE_URL_PLACEHOLDER, unsubscribeBlockHtml, unsubscribeHeaders,
} from './personal-mail.logic';

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
  const ok = { tenants: ['t'], calendars: ['scs'], startDate: '20261210' };
  it('refuses a personal event (no calendar) as gone', () => {
    expect(sendableEventRefusal({ ...ok, calendars: [] }, 't', '20261107')).toBe('eventGone');
    expect(sendableEventRefusal({ tenants: ['t'], startDate: '20261210' }, 't', '20261107')).toBe('eventGone');
  });

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

describe('refusedEventMessage', () => {
  it('names the event, or says «Ein Anlass» without a name', () => {
    expect(refusedEventMessage('GV 2026')).toContain('«GV 2026»');
    expect(refusedEventMessage(' ')).toMatch(/^Ein Anlass/);
    expect(refusedEventMessage(undefined)).toMatch(/^Ein Anlass/);
  });
});

describe('deadlineReached', () => {
  it('is reached only once more than the limit has passed', () => {
    expect(deadlineReached(1000, 1000 + PERSONAL_DEADLINE_MS)).toBe(false);
    expect(deadlineReached(1000, 1001 + PERSONAL_DEADLINE_MS)).toBe(true);
    expect(deadlineReached(0, 50, 40)).toBe(true);
    expect(deadlineReached(0, 40, 40)).toBe(false);
  });

  it('allows 480 s', () => {
    expect(PERSONAL_DEADLINE_MS).toBe(480_000);
  });
});

describe('deadlineOutcome', () => {
  it('fails the job and says how many mails went out', () => {
    expect(deadlineOutcome(312, 800)).toEqual({ state: 'failed', error: '312 von 800 Mails gesendet – die Zeit hat nicht gereicht.' });
  });
});

describe('personalEntries for a newsletter', () => {
  const unsub = (key: string) => `https://u/?p=${key}&g=nl`;

  it('gives each person their own unsubscribe link and headers, and no answer link without events', () => {
    const emails = new Map([['p1', 'a@x.ch'], ['p2', 'a@x.ch']]);
    expect(personalEntries(['p1', 'p2', 'p3'], emails, undefined, unsub)).toEqual([
      { to: 'a@x.ch', unsubscribeUrl: 'https://u/?p=p1&g=nl', headers: unsubscribeHeaders('https://u/?p=p1&g=nl') },
      { to: 'a@x.ch', unsubscribeUrl: 'https://u/?p=p2&g=nl', headers: unsubscribeHeaders('https://u/?p=p2&g=nl') },
    ]);
  });

  it('carries both links when the newsletter asks about events', () => {
    const [entry] = personalEntries(['p1'], new Map([['p1', 'a@x.ch']]), (k) => `https://a/?p=${k}`, unsub);
    expect(entry).toMatchObject({ answerUrl: 'https://a/?p=p1', unsubscribeUrl: 'https://u/?p=p1&g=nl' });
  });
});

describe('chunkPersonal', () => {
  it('splits into parts of at most MAX_PERSONAL_RECIPIENTS', () => {
    const parts = chunkPersonal(Array.from({ length: 1700 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([800, 800, 100]);
    expect(parts.flat()).toHaveLength(1700);
    expect(MAX_PERSONAL_RECIPIENTS).toBe(800);
  });

  it('keeps an empty list empty and takes another size', () => {
    expect(chunkPersonal([])).toEqual([]);
    expect(chunkPersonal([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});

describe('unsubscribeBlockHtml', () => {
  it('is one small centred line «Newsletter abbestellen» with the escaped url', () => {
    const html = unsubscribeBlockHtml('https://u/?p=1&g=2"x');
    expect(html).toContain('href="https://u/?p=1&amp;g=2&quot;x"');
    expect(html).toContain('>Newsletter abbestellen</a>');
    expect(html).toContain('text-align:center');
    expect(html).toContain('font-size:12px');
    expect(html.match(/<p\b/g)).toHaveLength(1);
  });
});

describe('unsubscribeHeaders', () => {
  it('names the url and the one-click POST (RFC 8058)', () => {
    expect(unsubscribeHeaders('https://u/?p=1')).toEqual({
      'List-Unsubscribe': '<https://u/?p=1>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});

describe('fillUrl and hasPlaceholder', () => {
  it('fill only their own placeholder', () => {
    const rendered = { html: `${ANSWER_URL_PLACEHOLDER} ${UNSUBSCRIBE_URL_PLACEHOLDER}`, text: `${ANSWER_URL_PLACEHOLDER} ${UNSUBSCRIBE_URL_PLACEHOLDER}` };
    const out = fillUrl(rendered, UNSUBSCRIBE_URL_PLACEHOLDER, 'https://u/?a=1&b=2');
    expect(out.html).toBe(`${ANSWER_URL_PLACEHOLDER} https://u/?a=1&amp;b=2`);
    expect(out.text).toBe(`${ANSWER_URL_PLACEHOLDER} https://u/?a=1&b=2`);
    expect(hasPlaceholder(out, UNSUBSCRIBE_URL_PLACEHOLDER)).toBe(false);
    expect(hasPlaceholder(out, ANSWER_URL_PLACEHOLDER)).toBe(true);
  });
});

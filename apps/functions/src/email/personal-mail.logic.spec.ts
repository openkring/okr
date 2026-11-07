import { describe, expect, it } from 'vitest';
import { answerBlockHtml, parseCaleventKeys, personalEntries, personalOutcome } from './personal-mail.logic';

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

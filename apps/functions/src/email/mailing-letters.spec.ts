import { describe, expect, it } from 'vitest';
import { buildLetterHtml, escapeHtml, isPdfAttachment, isReapableLetters, lettersPath, mayGetLetters, placeAndDate } from './mailing-letters';

describe('buildLetterHtml', () => {
  const html = buildLetterHtml({
    sender: { name: 'Seeclub <Stäfa>', street: 'Seestrasse 1', zipCity: '8712 Stäfa' },
    recipient: { name: 'Anna Muster', street: 'Dorfweg 2', zipCity: '8000 Zürich' },
    placeAndDate: 'Stäfa, 7.11.2026', subject: 'GV & Apéro', body: '<p>Liebe Mitglieder</p>',
  });

  it('puts the recipient in the window and escapes the plain fields', () => {
    expect(html).toContain('<div class="address">Anna Muster<br>Dorfweg 2<br>8000 Zürich</div>');
    expect(html).toContain('Seeclub &lt;Stäfa&gt;');
    expect(html).toContain('GV &amp; Apéro');
  });

  it('keeps the sanitised body as HTML', () => {
    expect(html).toContain('<div class="body"><p>Liebe Mitglieder</p></div>');
  });
});

describe('placeAndDate', () => {
  it('takes the city without the zip code', () => {
    expect(placeAndDate('8712 Stäfa', new Date(2026, 10, 7))).toBe('Stäfa, 7.11.2026');
    expect(placeAndDate('', new Date(2026, 0, 2))).toBe('2.1.2026');
  });
});

describe('helpers', () => {
  it('escapes html', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('knows a pdf by type or name', () => {
    expect(isPdfAttachment({ filename: 'a.PDF', contentType: 'application/octet-stream' })).toBe(true);
    expect(isPdfAttachment({ filename: 'a.jpg', contentType: 'image/jpeg' })).toBe(false);
  });

  it('builds the storage path under the letters prefix', () => {
    expect(lettersPath('scs', 'm1')).toBe('mailing-letters/scs/m1.pdf');
  });
});

describe('mayGetLetters', () => {
  const mailing = { tenants: ['scs'], senderUid: 'u1' };

  it('lets the sender and memberAdmin/privileged of the tenant download', () => {
    expect(mayGetLetters(mailing, 'u1', {})).toBe(true);
    expect(mayGetLetters(mailing, 'u2', { tenants: ['scs'], roles: { privileged: true } })).toBe(true);
  });

  it('refuses others and other tenants', () => {
    expect(mayGetLetters(mailing, 'u2', { tenants: ['scs'], roles: { registered: true } })).toBe(false);
    expect(mayGetLetters(mailing, 'u2', { tenants: ['kwa'], roles: { memberAdmin: true } })).toBe(false);
    expect(mayGetLetters(mailing, '', {})).toBe(false);
  });
});

describe('isReapableLetters', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');

  it('reaps letters older than 7 days only', () => {
    expect(isReapableLetters('mailing-letters/scs/m1.pdf', '2026-11-10T00:00:00Z', now)).toBe(true);
    expect(isReapableLetters('mailing-letters/scs/m1.pdf', '2026-11-15T00:00:00Z', now)).toBe(false);
  });

  it('never touches anything outside the letters prefix', () => {
    expect(isReapableLetters('mailings/scs/m1/0-a.pdf', '2020-01-01T00:00:00Z', now)).toBe(false);
    expect(isReapableLetters('mailing-letters/scs/m1.pdf', undefined, now)).toBe(false);
  });
});

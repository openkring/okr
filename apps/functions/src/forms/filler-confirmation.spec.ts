import { describe, expect, it } from 'vitest';
import type { Field } from '@okr/shared-models';
import { buildConfirmationMessage } from '@okr/shared-util-core';

import {
  buildFillerConfirmationHtml,
  buildFillerMail,
  DEFAULT_FILLER_CONFIRMATION,
  escapeHtml,
  firstVisibleEmail,
  MAIL_ANSWER_MAX,
  mailErrorCode,
  mailSafeAnswer,
  recipientLimitKey,
} from './filler-confirmation';

const f = (id: string, key: string, type: string, order: number): Field =>
  ({ id, key, type, label: key, required: false, width: 'full', order }) as Field;

const FIELDS: Field[] = [
  f('n', 'firstName', 'text', 0),
  f('e1', 'parentEmail', 'email', 1),
  f('e2', 'email', 'email', 2),
  f('s', 'ssnId', 'ssn', 3),
];

describe('firstVisibleEmail', () => {
  it('takes the first visible e-mail field with a value', () => {
    const values = { parentEmail: 'eltern@x.ch', email: 'kind@x.ch' };
    expect(firstVisibleEmail(FIELDS, values, new Set(['n', 'e1', 'e2']))).toBe('eltern@x.ch');
  });

  it('skips a hidden one', () => {
    const values = { parentEmail: 'eltern@x.ch', email: 'kind@x.ch' };
    expect(firstVisibleEmail(FIELDS, values, new Set(['n', 'e2']))).toBe('kind@x.ch');
  });

  it('skips an empty one and follows the field order, not the array order', () => {
    const reversed = [...FIELDS].reverse();
    expect(firstVisibleEmail(reversed, { parentEmail: ' ', email: 'kind@x.ch' }, new Set(['e1', 'e2']))).toBe('kind@x.ch');
    expect(firstVisibleEmail(reversed, { parentEmail: 'eltern@x.ch', email: 'kind@x.ch' }, new Set(['e1', 'e2']))).toBe('eltern@x.ch');
  });

  it('none -> undefined', () => {
    expect(firstVisibleEmail(FIELDS, { firstName: 'Ada' }, new Set(['n', 'e1', 'e2']))).toBeUndefined();
    expect(firstVisibleEmail([], {}, new Set())).toBeUndefined();
  });

  it('never an AHV field, and never something that is no address', () => {
    const ahvAsEmail = [f('x', 'ssnId', 'email', 0)];
    expect(firstVisibleEmail(ahvAsEmail, { ssnId: 'a@b.ch' }, new Set(['x']))).toBeUndefined();
    expect(firstVisibleEmail(FIELDS, { parentEmail: 'a@b.ch, c@d.ch' }, new Set(['e1']))).toBeUndefined();
    expect(firstVisibleEmail(FIELDS, { parentEmail: 'kein-at' }, new Set(['e1']))).toBeUndefined();
  });
});

describe('buildFillerConfirmationHtml', () => {
  it('escapes the text and keeps the line breaks', () => {
    const html = buildFillerConfirmationHtml('Kurs', 'a<b\nc');
    expect(html).toContain('a&lt;b<br>c');
    expect(html).toContain('Kurs');
  });

  it('escapes the form name', () => {
    expect(buildFillerConfirmationHtml('<x>', 't')).toContain('&lt;x&gt;');
  });
});

describe('buildFillerMail', () => {
  const visible = new Set(['n', 'e2', 's']);
  const answers = { firstName: 'Ada', email: 'ada@x.ch', ssnId: '7561234567897' };

  it('mails the confirmation to the first visible e-mail', () => {
    const mail = buildFillerMail('Kurs', 'Danke Ada', FIELDS, answers, visible);
    expect(mail).toEqual({ to: 'ada@x.ch', subject: 'Kurs – Bestätigung', html: expect.stringContaining('Danke Ada') });
  });

  it('uses the default text when the form has none', () => {
    expect(buildFillerMail('Kurs', '', FIELDS, answers, visible)?.html).toContain(DEFAULT_FILLER_CONFIRMATION);
  });

  it('no e-mail -> no mail', () => {
    expect(buildFillerMail('Kurs', 'x', FIELDS, { firstName: 'Ada' }, visible)).toBeUndefined();
  });

  it('R1: an AHV placeholder never puts the number into the confirmation or the mail', () => {
    const confirmation = buildConfirmationMessage(FIELDS, 'Danke {firstName}. AHV: {ssnId}', [], answers, visible, '20261102');
    expect(confirmation).toBe('Danke Ada. AHV: ');
    const mail = buildFillerMail('Kurs', confirmation, FIELDS, answers, visible);
    expect(mail?.html).toContain('Danke Ada.');
    expect(mail?.html).not.toContain('7561234567897');
    expect(mail?.html).not.toMatch(/756[.\d]/);
  });
});

describe('mailErrorCode', () => {
  it('keeps only the HTTP status of a provider error, never its body', () => {
    const code = mailErrorCode(new Error('Mailtrap API error 400: {"errors":["ada@x.ch is invalid"]}'));
    expect(code).toBe('400');
  });

  it('falls back to a short error code, else unknown', () => {
    expect(mailErrorCode(Object.assign(new Error('connect refused ada@x.ch'), { code: 'ECONNREFUSED' }))).toBe('ECONNREFUSED');
    expect(mailErrorCode(new Error('ada@x.ch rejected'))).toBe('unknown');
    expect(mailErrorCode({ code: 'ada@x.ch is bad' })).toBe('unknown');
    expect(mailErrorCode(undefined)).toBe('unknown');
  });
});

describe('escapeHtml', () => {
  it('escapes the four HTML characters', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('mailSafeAnswer', () => {
  it('keeps an ordinary answer as typed', () => {
    expect(mailSafeAnswer('Ada Lovelace')).toBe('Ada Lovelace');
    expect(mailSafeAnswer('St. Gallen, 3 Jahre')).toBe('St. Gallen, 3 Jahre');
  });

  it('drops every word that could become a link, address or domain', () => {
    expect(mailSafeAnswer('Ada https://evil.example/login now')).toBe('Ada now');
    expect(mailSafeAnswer('go to www.evil.example')).toBe('go to');
    expect(mailSafeAnswer('see evil.example/reset or bit.ly/x')).toBe('see or');
    expect(mailSafeAnswer('write me at ada@evil.example')).toBe('write me at');
    expect(mailSafeAnswer('open data:text/html,x or javascript:alert')).toBe('open or');
    // the price of an allowlist: harmless dotted words go too
    expect(mailSafeAnswer('St.Gallen 1.5 Jahre')).toBe('Jahre');
  });

  it('catches dot look-alikes and fullwidth forms', () => {
    expect(mailSafeAnswer('go evil\u3002example')).toBe('go');
    expect(mailSafeAnswer('go evil\uFF0Eexample')).toBe('go');
    expect(mailSafeAnswer('go evil\uFF61example')).toBe('go');
    expect(mailSafeAnswer('go evil\u2024example')).toBe('go');
    expect(mailSafeAnswer('go evil\uFF0Fpath')).toBe('go');
  });

  it('removes invisible characters that could hide a link', () => {
    expect(mailSafeAnswer('go evil.\u200Bexample')).toBe('go');
    expect(mailSafeAnswer('go evil\u00AD.example')).toBe('go');
    expect(mailSafeAnswer('A\u202Eda')).toBe('Ada');
  });

  it('puts the answer on one line', () => {
    expect(mailSafeAnswer('Ada\n\nDear customer,\r\nyour account')).toBe('Ada Dear customer, your account');
  });

  it('cuts a long answer', () => {
    const out = mailSafeAnswer('a'.repeat(200));
    expect(out.length).toBe(MAIL_ANSWER_MAX);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('recipientLimitKey', () => {
  it('maps +tag, dot and case variants of one mailbox to one key', () => {
    const key = recipientLimitKey('ada@example.ch');
    expect(recipientLimitKey('Ada@Example.CH')).toBe(key);
    expect(recipientLimitKey('ada+1@example.ch')).toBe(key);
    expect(recipientLimitKey('a.d.a+promo@example.ch')).toBe(key);
    expect(recipientLimitKey(' ada@example.ch ')).toBe(key);
  });

  it('keeps different mailboxes and domains apart', () => {
    expect(recipientLimitKey('ada@example.ch')).not.toBe(recipientLimitKey('bob@example.ch'));
    expect(recipientLimitKey('ada@example.ch')).not.toBe(recipientLimitKey('ada@example.org'));
  });

  it('leaves a value without a local part as it is', () => {
    expect(recipientLimitKey('@example.ch')).toBe('@example.ch');
    expect(recipientLimitKey('nobody')).toBe('nobody');
  });
});

describe('buildFillerMail with mail-safe answers', () => {
  it('a stranger link in a placeholder never reaches the mail body', () => {
    const fields = [
      { id: 'n', key: 'firstName', type: 'text', order: 1 },
      { id: 'e', key: 'email', type: 'email', order: 2 },
    ] as Field[];
    const answers = { firstName: 'Click https://evil.example', email: 'victim@example.ch' };
    const visible = new Set(['n', 'e']);
    const text = buildConfirmationMessage(fields, 'Danke {firstName}', undefined, answers, visible, '20261103', mailSafeAnswer);
    const mail = buildFillerMail('Kurs', text, fields, answers, visible);
    expect(mail?.html).toContain('Danke Click');
    expect(mail?.html).not.toContain('evil');
  });
});

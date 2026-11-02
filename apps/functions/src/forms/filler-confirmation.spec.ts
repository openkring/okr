import { describe, expect, it } from 'vitest';
import type { Field } from '@okr/shared-models';
import { buildConfirmationMessage } from '@okr/shared-util-core';

import {
  buildFillerConfirmationHtml,
  buildFillerMail,
  DEFAULT_FILLER_CONFIRMATION,
  firstVisibleEmail,
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

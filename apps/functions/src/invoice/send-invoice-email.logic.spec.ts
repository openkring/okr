import { describe, expect, it } from 'vitest';

import { emailDocumentKind, followUpDueDate, invoiceEmailAsksPayment, isInvoiceFollowUp, invoiceEmailHtml, invoiceEmailSubject, reminderMailFilename, MAX_INLINE_ATTACHMENT_BYTES, normalizeComposedMail, recipientDirectoryId, scrubEmailAddresses, sendRefusal } from './send-invoice-email.logic';

describe('emailDocumentKind', () => {
  const invoice = { documentKey: 'invoice-a', reminders: [{ level: 1, date: '', dueDate: '', documentKey: 'invoice-a-reminder-1' }, { level: 2, date: '', dueDate: '', documentKey: 'invoice-a-reminder-2' }] };
  it('recognises the invoice document', () => expect(emailDocumentKind(invoice, 'invoice-a')).toEqual({ kind: 'invoice' }));
  it('recognises a reminder document with its level', () => expect(emailDocumentKind(invoice, 'invoice-a-reminder-2')).toEqual({ kind: 'reminder', level: 2 }));
  it('refuses an unknown key', () => expect(emailDocumentKind(invoice, 'invoice-b')).toBeUndefined());
  it('refuses an empty key even when the invoice has no document', () => expect(emailDocumentKind({}, '')).toBeUndefined());
});

describe('invoiceEmailSubject', () => {
  it('reminder subject uses the reminder name', () =>
    expect(invoiceEmailSubject('reminder', 'Mahnung', '202600001', 'Seeclub Stäfa')).toBe('Mahnung zu Rechnung 202600001 – Seeclub Stäfa'));
  it('invoice subject ignores the name', () =>
    expect(invoiceEmailSubject('invoice', '', '202600001', 'Seeclub Stäfa')).toBe('Rechnung 202600001 – Seeclub Stäfa'));
});

describe('reminderMailFilename', () => {
  it('reminder filename from the name', () =>
    expect(reminderMailFilename('Letzte Mahnung', '202600001')).toBe('Letzte-Mahnung-202600001.pdf'));
  it('reminder filename strips unsafe characters', () =>
    expect(reminderMailFilename('Mahnung / 2', '202600001')).toBe('Mahnung-2-202600001.pdf'));
});

describe('invoiceEmailHtml', () => {
  it('invoice body carries id, amount, date and sign-off', () => {
    const html = invoiceEmailHtml('invoice', '', '202600001', '120.50', '31.10.2026', 'Seeclub');
    expect(html).toContain('die Rechnung 202600001');
    expect(html).toContain('CHF 120.50 bis 31.10.2026');
    expect(html).toContain('Freundliche Grüsse');
    expect(html).toContain('Seeclub');
    expect(html).not.toContain('!');
  });
  it('reminder body names the reminder and the open amount', () => {
    const html = invoiceEmailHtml('reminder', '2. Mahnung', '7', '30.00', '15.11.2026', 'Seeclub');
    expect(html).toContain('2. Mahnung zu Rechnung 7');
    expect(html).toContain('offenen Betrag von CHF 30.00 bis 15.11.2026');
    expect(invoiceEmailHtml('reminder', 'Zahlungserinnerung', '202600001', '120.00', '31.10.2026', 'SCS')).toContain('die Zahlungserinnerung zu Rechnung 202600001');
  });
  it('escapes markup in invoiceId and orgName', () => {
    const html = invoiceEmailHtml('invoice', '', '<script>a</script>', '1.00', 'd', '<b>x</b>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('invoice mail without a payment request (P3-R3)', () => {
  it('asks for payment only when payable and something is open', () => {
    expect(invoiceEmailAsksPayment('pending', 12050)).toBe(true);
    expect(invoiceEmailAsksPayment('partial', 100)).toBe(true);
    expect(invoiceEmailAsksPayment('unpaid', 1)).toBe(true);
    expect(invoiceEmailAsksPayment('pending', 0)).toBe(false);
    expect(invoiceEmailAsksPayment('paid', 0)).toBe(false);
    expect(invoiceEmailAsksPayment('paid', 500)).toBe(false);
    expect(invoiceEmailAsksPayment('cancelled', 500)).toBe(false);
    expect(invoiceEmailAsksPayment(undefined, 500)).toBe(false);
  });
  it('the neutral body names the invoice and asks for nothing', () => {
    const html = invoiceEmailHtml('invoice', '', '202600001', '0.00', '31.10.2026', 'Seeclub', false);
    expect(html).toBe('<p>Hallo,</p><p>im Anhang findest du die Rechnung 202600001.</p><p>Freundliche Grüsse<br>Seeclub</p>');
    expect(html).not.toContain('überweise');
    expect(html).not.toContain('CHF');
  });
  it('the neutral body escapes its inputs too', () => {
    const html = invoiceEmailHtml('invoice', '', '<i>1</i>', '', '', '<b>x</b>', false);
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<b>');
  });
  it('a reminder always asks for payment (it is only sent while payable)', () => {
    expect(invoiceEmailHtml('reminder', '2. Mahnung', '7', '30.00', '15.11.2026', 'Seeclub', false)).toContain('offenen Betrag von CHF 30.00');
  });
});

describe('recipientDirectoryId', () => {
  it('person', () => expect(recipientDirectoryId('scs', { key: 'p1', modelType: 'person' })).toBe('scs_person.p1'));
  it('org', () => expect(recipientDirectoryId('scs', { key: 'o1', modelType: 'org' })).toBe('scs_org.o1'));
  it('no key', () => expect(recipientDirectoryId('scs', { modelType: 'person' })).toBeUndefined());
  it('other type', () => expect(recipientDirectoryId('scs', { key: 'g1', modelType: 'group' })).toBeUndefined());
  it('no receiver', () => expect(recipientDirectoryId('scs', {})).toBeUndefined());
});

describe('invoiceEmailHtml without a due date', () => {
  it('omits the bis clause', () => {
    for (const kind of ['invoice', 'reminder'] as const) {
      const html = invoiceEmailHtml(kind, 'Zahlungserinnerung', '7', '30.00', '', 'Seeclub');
      expect(html).toContain('CHF 30.00.');
      expect(html).not.toContain(' bis');
    }
  });
});

describe('scrubEmailAddresses', () => {
  it('replaces anything that looks like an address', () => {
    expect(scrubEmailAddresses('550 rejected: max.muster@example.ch <a.b@c.d> unknown')).toBe('550 rejected: [email] <[email]> unknown');
    expect(scrubEmailAddresses('no address here')).toBe('no address here');
  });
});

describe('sendRefusal', () => {
  it('mails a reminder only while the invoice is open', () => {
    for (const state of ['pending', 'partial', 'unpaid']) expect(sendRefusal('reminder', state)).toBeUndefined();
    expect(sendRefusal('reminder', 'paid')).toBe('not-payable');
    expect(sendRefusal('reminder', 'cancelled')).toBe('not-payable');
    expect(sendRefusal('reminder', undefined)).toBe('not-payable');
  });
  it('mails the invoice PDF in any issued state, never a draft', () => {
    expect(sendRefusal('invoice', 'paid')).toBeUndefined();
    expect(sendRefusal('invoice', 'cancelled')).toBe('not-sendable');
    for (const state of ['pending', 'partial', 'unpaid']) expect(sendRefusal('invoice', state)).toBeUndefined();
    expect(sendRefusal('invoice', 'draft')).toBe('not-issued');
    expect(sendRefusal('reminder', 'draft')).toBe('not-issued');
  });
  it('does not mail a reminder whose fee was waived (its PDF still shows the fee)', () => {
    expect(sendRefusal('reminder', 'pending', '20261101')).toBe('already-waived');
    expect(sendRefusal('reminder', 'pending', '')).toBeUndefined();
    expect(sendRefusal('invoice', 'pending', '20261101')).toBeUndefined();
    expect(sendRefusal('reminder', 'paid', '20261101')).toBe('not-payable');
  });
});

describe('normalizeComposedMail', () => {
  const base = { to: ['anna@example.ch'], subject: 'Rechnung 1', html: '<p>Hallo</p>' };

  it('accepts a plain mail and falls back to the tenant sender', () => {
    const r = normalizeComposedMail(base, 'kassier@seeclub.org');
    expect(r).toEqual({ ok: true, mail: { to: ['anna@example.ch'], cc: [], bcc: [], from: 'kassier@seeclub.org', subject: 'Rechnung 1', html: '<p>Hallo</p>', extraAttachments: [] } });
  });

  it('keeps cc, bcc, an own sender and trims addresses', () => {
    const r = normalizeComposedMail({ ...base, to: [' anna@example.ch '], cc: ['b@example.ch'], bcc: ['c@example.ch', ''], from: 'bruno@seeclub.org' }, 'x@seeclub.org');
    expect(r.ok && r.mail).toMatchObject({ to: ['anna@example.ch'], cc: ['b@example.ch'], bcc: ['c@example.ch'], from: 'bruno@seeclub.org' });
  });

  it('refuses a mail without a valid recipient', () => {
    expect(normalizeComposedMail({ ...base, to: [] }, 'x@y.ch')).toEqual({ ok: false, reason: 'bad-recipients' });
    expect(normalizeComposedMail({ ...base, to: ['no-address'] }, 'x@y.ch')).toEqual({ ok: false, reason: 'bad-recipients' });
    expect(normalizeComposedMail({ ...base, cc: ['a@b.ch, c@d.ch'] }, 'x@y.ch')).toEqual({ ok: false, reason: 'bad-recipients' });
    expect(normalizeComposedMail({ ...base, to: 'anna@example.ch' }, 'x@y.ch')).toEqual({ ok: false, reason: 'bad-recipients' });
  });

  it('refuses a malformed sender, an empty subject and an empty body', () => {
    expect(normalizeComposedMail({ ...base, from: 'kassier' }, 'x@y.ch')).toEqual({ ok: false, reason: 'bad-from' });
    expect(normalizeComposedMail({ ...base, subject: '  ' }, 'x@y.ch')).toEqual({ ok: false, reason: 'no-subject' });
    expect(normalizeComposedMail({ ...base, html: '<p></p>' }, 'x@y.ch')).toEqual({ ok: false, reason: 'no-body' });
  });

  it('accepts inline attachments only, within the size cap', () => {
    const ok = normalizeComposedMail({ ...base, extraAttachments: [{ filename: 'a.txt', contentBase64: 'aGk=', contentType: 'text/plain' }] }, 'x@y.ch');
    expect(ok.ok && ok.mail.extraAttachments).toEqual([{ filename: 'a.txt', contentBase64: 'aGk=', contentType: 'text/plain' }]);
    expect(normalizeComposedMail({ ...base, extraAttachments: [{ storagePath: 'tenant/scs/x.pdf' }] }, 'x@y.ch')).toEqual({ ok: false, reason: 'bad-attachment' });
    const huge = 'A'.repeat(Math.ceil(MAX_INLINE_ATTACHMENT_BYTES * 4 / 3) + 8);
    expect(normalizeComposedMail({ ...base, extraAttachments: [{ filename: 'big.bin', contentBase64: huge }] }, 'x@y.ch')).toEqual({ ok: false, reason: 'bad-attachment' });
  });
});

describe('invoice follow-up (informal Zahlungserinnerung, spec 1.90)', () => {
  const inv = { state: 'pending', dueDate: '20261001', sentAt: '20260915' };
  it('an overdue, already sent, payable invoice is a follow-up', () => expect(isInvoiceFollowUp(inv, '20261008')).toBe(true));
  it('not before or on the due date', () => {
    expect(isInvoiceFollowUp(inv, '20261001')).toBe(false);
    expect(isInvoiceFollowUp(inv, '20260930')).toBe(false);
  });
  it('not when it was never sent (first send of a late invoice)', () => expect(isInvoiceFollowUp({ ...inv, sentAt: '' }, '20261008')).toBe(false));
  it('not when paid or cancelled', () => {
    expect(isInvoiceFollowUp({ ...inv, state: 'paid' }, '20261008')).toBe(false);
    expect(isInvoiceFollowUp({ ...inv, state: 'cancelled' }, '20261008')).toBe(false);
  });
  it('not with a missing or invalid due date', () => {
    expect(isInvoiceFollowUp({ ...inv, dueDate: '' }, '20261008')).toBe(false);
    expect(isInvoiceFollowUp({ ...inv, dueDate: '20261399' }, '20261008')).toBe(false);
  });
  it('legacy invoices without sentAt are not follow-ups', () => expect(isInvoiceFollowUp({ state: 'pending', dueDate: '20261001' }, '20261008')).toBe(false));
  it('new due date = today + reminderDueDays', () => {
    expect(followUpDueDate('20261008', 14)).toBe('20261022');
    expect(followUpDueDate('20261008', 0)).toBe('20261008');
  });
  it('follow-up subject', () =>
    expect(invoiceEmailSubject('followUp', '', '202600001', 'Seeclub Stäfa')).toBe('Zahlungserinnerung zu Rechnung 202600001 – Seeclub Stäfa'));
  it('follow-up body: friendly, open amount, new due date, no exclamation mark', () => {
    const html = invoiceEmailHtml('followUp', '', '202600001', '120.00', '22.10.2026', 'SCS');
    expect(html).toContain('nochmals die Rechnung 202600001');
    expect(html).toContain('CHF 120.00 bis 22.10.2026');
    expect(html).not.toContain('!');
  });
});

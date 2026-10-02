import { describe, expect, it } from 'vitest';

import { emailDocumentKind, invoiceEmailHtml, invoiceEmailSubject, recipientDirectoryId } from './send-invoice-email.logic';

describe('emailDocumentKind', () => {
  const invoice = { documentKey: 'invoice-a', reminders: [{ level: 1, date: '', dueDate: '', documentKey: 'invoice-a-reminder-1' }, { level: 2, date: '', dueDate: '', documentKey: 'invoice-a-reminder-2' }] };
  it('recognises the invoice document', () => expect(emailDocumentKind(invoice, 'invoice-a')).toEqual({ kind: 'invoice' }));
  it('recognises a reminder document with its level', () => expect(emailDocumentKind(invoice, 'invoice-a-reminder-2')).toEqual({ kind: 'reminder', level: 2 }));
  it('refuses an unknown key', () => expect(emailDocumentKind(invoice, 'invoice-b')).toBeUndefined());
  it('refuses an empty key even when the invoice has no document', () => expect(emailDocumentKind({}, '')).toBeUndefined());
});

describe('invoiceEmailSubject', () => {
  it('invoice', () => expect(invoiceEmailSubject('invoice', 0, '202600001', 'Seeclub Stäfa')).toBe('Rechnung 202600001 – Seeclub Stäfa'));
  it('level 1 is a Zahlungserinnerung', () => expect(invoiceEmailSubject('reminder', 1, '202600001', 'Seeclub Stäfa')).toBe('Zahlungserinnerung zu Rechnung 202600001 – Seeclub Stäfa'));
  it('level 2', () => expect(invoiceEmailSubject('reminder', 2, '202600001', 'Seeclub Stäfa')).toBe('2. Mahnung zu Rechnung 202600001 – Seeclub Stäfa'));
  it('level 3', () => expect(invoiceEmailSubject('reminder', 3, '1', 'X')).toBe('3. Mahnung zu Rechnung 1 – X'));
});

describe('invoiceEmailHtml', () => {
  it('invoice body carries id, amount, date and sign-off', () => {
    const html = invoiceEmailHtml('invoice', 0, '202600001', '120.50', '31.10.2026', 'Seeclub');
    expect(html).toContain('die Rechnung 202600001');
    expect(html).toContain('CHF 120.50 bis 31.10.2026');
    expect(html).toContain('Freundliche Grüsse');
    expect(html).toContain('Seeclub');
    expect(html).not.toContain('!');
  });
  it('reminder body names the reminder and the open amount', () => {
    const html = invoiceEmailHtml('reminder', 2, '7', '30.00', '15.11.2026', 'Seeclub');
    expect(html).toContain('2. Mahnung zu Rechnung 7');
    expect(html).toContain('offenen Betrag von CHF 30.00 bis 15.11.2026');
    expect(invoiceEmailHtml('reminder', 1, '7', '1.00', 'd', 'o')).toContain('die Zahlungserinnerung zu Rechnung 7');
  });
  it('escapes markup in invoiceId and orgName', () => {
    const html = invoiceEmailHtml('invoice', 0, '<script>a</script>', '1.00', 'd', '<b>x</b>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('recipientDirectoryId', () => {
  it('person', () => expect(recipientDirectoryId('scs', { key: 'p1', modelType: 'person' })).toBe('scs_person.p1'));
  it('org', () => expect(recipientDirectoryId('scs', { key: 'o1', modelType: 'org' })).toBe('scs_org.o1'));
  it('no key', () => expect(recipientDirectoryId('scs', { modelType: 'person' })).toBeUndefined());
  it('other type', () => expect(recipientDirectoryId('scs', { key: 'g1', modelType: 'group' })).toBeUndefined());
  it('no receiver', () => expect(recipientDirectoryId('scs', {})).toBeUndefined());
});

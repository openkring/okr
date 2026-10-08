import { buildReminderPayload } from './reminder-payload.logic';

const base = { invoiceId: '202600007', invoiceDate: '20260901', title: 'Mitgliederbeitrag 2026', totalAmount: { amount: 30000 } };
const recipient = { firstName: 'Ada', lastName: 'Muster' };

describe('buildReminderPayload', () => {
  it('level 2 with an earlier fee and a partial payment', () => {
    const p = buildReminderPayload({
      invoice: { ...base, payments: [{ amount: 10000 }], reminders: [{ level: 1, date: '20261010', dueDate: '20261024', fee: 0 }] },
      level: 2, date: '20261105', dueDate: '20261119', fee: 2000, recipient, templateName: '',
    });
    expect(p['heading']).toBe('2. Mahnung');
    expect(p['amountDue']).toBe('220.00');
    expect(p['amount']).toBe('220.00');
    expect(p['feesTotal']).toBe('20.00');
    expect(p['paidTotal']).toBe('100.00');
    expect(p['qrAmount']).toBe(220);
    expect(p['qrMessage']).toBe('Rechnung 202600007');
    expect(p['dueDate']).toBe('19.11.2026');
    expect(p['firstName']).toBe('Ada');
  });

  it('level 1 is a Zahlungserinnerung', () => {
    const p = buildReminderPayload({ invoice: base, level: 1, date: '20261010', dueDate: '20261024', fee: 0, recipient, templateName: '' });
    expect(p['heading']).toBe('Zahlungserinnerung');
    expect(p['amountDue']).toBe('300.00');
    expect(p['levelText']).toContain('untergegangen');
  });

  it('level 3 is a 3. Mahnung', () => {
    const p = buildReminderPayload({ invoice: base, level: 3, date: '20261010', dueDate: '20261024', fee: 2000, recipient, templateName: '' });
    expect(p['heading']).toBe('3. Mahnung');
    expect(p['levelText']).toContain('weitere Schritte');
  });

  it('amountDue is never negative', () => {
    const p = buildReminderPayload({ invoice: { ...base, payments: [{ amount: 99999 }] }, level: 1, date: '20261010', dueDate: '20261024', fee: 0, recipient, templateName: '' });
    expect(p['amountDue']).toBe('0.00');
    expect(p['qrAmount']).toBe(0);
  });

  it('takes the heading from the template name', () => {
    const p = buildReminderPayload({ invoice: base, level: 4, date: '20261010', dueDate: '20261024', fee: 0, recipient, templateName: 'Letzte Mahnung' });
    expect(p['heading']).toBe('Letzte Mahnung');
    expect(p['level']).toBe(4);
  });

  it('legacy heading without a template name', () => {
    expect(buildReminderPayload({ invoice: base, level: 2, date: '20261010', dueDate: '20261024', fee: 0, recipient, templateName: '' })['heading']).toBe('2. Mahnung');
  });
});

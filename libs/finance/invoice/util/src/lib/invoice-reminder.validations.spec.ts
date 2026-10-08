import { describe, expect, it } from 'vitest';
import { reminderFormValidations } from './invoice-reminder.validations';

const ok = { templateId: 'mahnung', date: '20261008', feeChf: 20, channel: 'post' as const, attachInvoice: false, openAmountChf: 120, selectedKeys: [] };

describe('reminder form validations', () => {
  it('accepts a complete form', () => expect(reminderFormValidations(ok, false).hasErrors()).toBe(false));
  it('needs a template', () => expect(reminderFormValidations({ ...ok, templateId: '' }, false).hasErrors('templateId')).toBe(true));
  it('needs a full date', () => expect(reminderFormValidations({ ...ok, date: '202610' }, false).hasErrors('date')).toBe(true));
  it('rejects a negative fee', () => expect(reminderFormValidations({ ...ok, feeChf: -1 }, false).hasErrors('feeChf')).toBe(true));
  it('rejects three decimals', () => expect(reminderFormValidations({ ...ok, feeChf: 20.505 }, false).hasErrors('feeChf')).toBe(true));
  it('Mahnlauf needs a selection', () => {
    expect(reminderFormValidations(ok, true).hasErrors('selectedKeys')).toBe(true);
    expect(reminderFormValidations({ ...ok, selectedKeys: ['a'] }, true).hasErrors('selectedKeys')).toBe(false);
  });
});

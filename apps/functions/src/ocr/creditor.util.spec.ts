import { describe, expect, it } from 'vitest';
import { sanitizeCreditor } from './creditor.util';

const raw = { vendor: 'V', invoiceDate: '', grossAmount: 0, currency: 'CHF' };

describe('sanitizeCreditor', () => {
  it('normalises a valid IBAN', () =>
    expect(sanitizeCreditor({ ...raw, creditorIban: 'ch93 0076 2011 6238 5295 7' }).creditorIban).toBe('CH9300762011623852957'));
  it('drops an IBAN that fails mod-97', () =>
    expect(sanitizeCreditor({ ...raw, creditorIban: 'CH93 0076 2011 6238 5295 8' }).creditorIban).toBe(''));
  it('defaults every missing field to empty', () =>
    expect(sanitizeCreditor(raw)).toEqual({ creditorIban: '', creditorName: '', creditorAddress: '', reference: '' }));
  it('trims name, address and reference', () =>
    expect(sanitizeCreditor({ ...raw, creditorName: ' Garage X ', creditorAddress: ' Seestr. 5, 8712 Stäfa ', reference: ' RF18 ' }))
      .toEqual({ creditorIban: '', creditorName: 'Garage X', creditorAddress: 'Seestr. 5, 8712 Stäfa', reference: 'RF18' }));
});

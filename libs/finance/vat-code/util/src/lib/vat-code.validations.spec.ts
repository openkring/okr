import { describe, expect, it } from 'vitest';
import { VatCodeModel } from '@okr/shared-models';
import { VAT_CODE_NAME_LENGTH, vatCodeValidations } from './vat-code.validations';

const vatCode = (patch: Partial<VatCodeModel> = {}): VatCodeModel => ({ ...new VatCodeModel('scs', 'scs'), ...patch } as VatCodeModel);

describe('vatCodeValidations', () => {
  it('accepts a new, empty VAT code (the old dialog had no mandatory field)', () => {
    expect(vatCodeValidations(vatCode()).isValid()).toBe(true);
  });

  it('accepts a standard code with an open-ended validity', () => {
    expect(vatCodeValidations(vatCode({ code: 'UST_81', name: 'MWST 8.1% Umsatzsteuer', rate: 8.1, validFrom: '20240101', validTo: '' })).isValid()).toBe(true);
  });

  it('rejects a code or name longer than the input cap', () => {
    expect(vatCodeValidations(vatCode({ code: 'x'.repeat(VAT_CODE_NAME_LENGTH + 1) })).hasErrors('code')).toBe(true);
    expect(vatCodeValidations(vatCode({ name: 'x'.repeat(VAT_CODE_NAME_LENGTH + 1) })).hasErrors('name')).toBe(true);
  });

  it('rejects a negative rate', () => {
    expect(vatCodeValidations(vatCode({ rate: -1 })).hasErrors('rate')).toBe(true);
  });

  it('rejects invalid validity dates', () => {
    expect(vatCodeValidations(vatCode({ validFrom: '20241301' })).hasErrors('validFrom')).toBe(true);
    expect(vatCodeValidations(vatCode({ validTo: '2024' })).hasErrors('validTo')).toBe(true);
  });
});

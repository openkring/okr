import { describe, expect, it } from 'vitest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';

import { billQrScanValidations, newBillQrScanFormModel } from './bill-qr-scan.validations';

describe('billQrScanValidations', () => {
  it('rejects empty content', () => {
    expect(billQrScanValidations(newBillQrScanFormModel()).hasErrors('qrContent')).toBe(true);
  });

  it('rejects blank content', () => {
    expect(billQrScanValidations({ qrContent: '  \n ' }).hasErrors('qrContent')).toBe(true);
  });

  it('accepts QR content', () => {
    expect(billQrScanValidations({ qrContent: 'SPC\n0200\n1' }).isValid()).toBe(true);
  });

  it('rejects content longer than DESCRIPTION_LENGTH', () => {
    expect(billQrScanValidations({ qrContent: 'x'.repeat(DESCRIPTION_LENGTH + 1) }).hasErrors('qrContent')).toBe(true);
  });
});

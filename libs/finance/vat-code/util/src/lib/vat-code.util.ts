import { VatCodeModel } from '@bk2/shared-models';

export function computeVatFromNet(netCents: number, ratePercent: number): number {
  return Math.round(netCents * ratePercent / 100);
}

export function computeGrossFromNet(netCents: number, ratePercent: number): number {
  return netCents + computeVatFromNet(netCents, ratePercent);
}

/**
 * Finds the VAT code active on storeDate ("YYYYMMDD").
 * validTo = '' means open-ended.
 */
export function resolveActiveVatCode(codes: VatCodeModel[], storeDate: string): VatCodeModel | undefined {
  return codes.find(c => {
    const from = c.validFrom ?? '';
    const to   = c.validTo   ?? '';
    return storeDate >= from && (to === '' || storeDate <= to);
  });
}

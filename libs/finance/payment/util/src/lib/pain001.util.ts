export type Pain001PaymentType = 'QRR' | 'SCOR' | 'SEPA' | 'ICP' | 'NON';

export function detectPaymentType(iban: string, currency: string, reference: string): Pain001PaymentType {
  const normalized = iban.replace(/\s+/g, '').toUpperCase();
  const isQrIban = /^CH\d{2}3[01]\d{3}/.test(normalized);
  const isQrRef = /^\d{27}$/.test(reference.replace(/\s+/g, ''));
  const isScorRef = /^RF\d{2}/.test(reference.replace(/\s+/g, '').toUpperCase());

  if (isQrIban && isQrRef) return 'QRR';
  if (isScorRef) return 'SCOR';
  if (currency === 'EUR') return 'SEPA';
  if (currency !== 'CHF') return 'ICP';
  return 'NON';
}

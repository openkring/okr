import { describe, expect, it } from 'vitest';

import { findQrReference, formatQrReference, generateQrReference, isQrIban, isValidQrReference, normalizeQrReference, qrrCheckDigit } from './qr-reference.util';

describe('isQrIban', () => {
  it('accepts CH/LI IBANs whose IID is 30000–31999', () => {
    expect(isQrIban('CH44 3199 9123 0008 8901 2')).toBe(true);
    expect(isQrIban('ch4430000123000889012')).toBe(true);
    expect(isQrIban('LI2131000000000000000')).toBe(true);
    expect(isQrIban('CH4430000123000889W12')).toBe(true);   // letters in the account part
  });
  it('rejects regular IBANs, other countries and empty input', () => {
    expect(isQrIban('CH9300762011623852957')).toBe(false);
    expect(isQrIban('CH4432000123000889012')).toBe(false);
    expect(isQrIban('DE89370400440532013000')).toBe(false);
    expect(isQrIban('')).toBe(false);
    expect(isQrIban(undefined)).toBe(false);
  });
});

describe('qrrCheckDigit', () => {
  it('computes the recursive mod-10 digit (SIX example)', () => {
    expect(qrrCheckDigit('21000000000313947143000901')).toBe(7);
    expect(qrrCheckDigit('00000000000000000000000000')).toBe(0);
  });
});

describe('generateQrReference', () => {
  it('pads the base to 26 digits and appends the check digit', () => {
    expect(generateQrReference('21000000000313947143000901')).toBe('210000000003139471430009017');
    const ref = generateQrReference(202600042);
    expect(ref).toHaveLength(27);
    expect(ref.startsWith('00000000000000000202600042')).toBe(true);
    expect(isValidQrReference(ref)).toBe(true);
  });
  it('throws on a non-digit or too long base', () => {
    expect(() => generateQrReference('12a')).toThrow();
    expect(() => generateQrReference('1'.repeat(27))).toThrow();
    expect(() => generateQrReference(-1)).toThrow();
  });
});

describe('normalize / validate / format', () => {
  it('strips whitespace', () => {
    expect(normalizeQrReference(' 21 00000 00003 13947 14300 09017 ')).toBe('210000000003139471430009017');
    expect(normalizeQrReference(undefined)).toBe('');
  });
  it('validates length and check digit', () => {
    expect(isValidQrReference('21 00000 00003 13947 14300 09017')).toBe(true);
    expect(isValidQrReference('210000000003139471430009018')).toBe(false);
    expect(isValidQrReference('21000000000313947143000901')).toBe(false);
    expect(isValidQrReference('')).toBe(false);
  });
  it('formats as 2 + groups of 5', () => {
    expect(formatQrReference('210000000003139471430009017')).toBe('21 00000 00003 13947 14300 09017');
    expect(formatQrReference('')).toBe('');
  });
});

describe('findQrReference', () => {
  it('finds a reference written in groups inside bank text', () => {
    expect(findQrReference('Gutschrift Muster Hans Ref. 21 00000 00003 13947 14300 09017 Danke'))
      .toBe('210000000003139471430009017');
  });
  it('finds an unspaced reference', () => {
    expect(findQrReference('QRR 210000000003139471430009017')).toBe('210000000003139471430009017');
  });
  it('tolerates a neighbouring number before or after', () => {
    expect(findQrReference('Betrag 120 21 00000 00003 13947 14300 09017')).toBe('210000000003139471430009017');
    expect(findQrReference('21 00000 00003 13947 14300 09017 20260101')).toBe('210000000003139471430009017');
    expect(findQrReference('Ref 210000000003139471430009017 99')).toBe('210000000003139471430009017');
  });
  it('ignores punctuation and labels glued to the reference', () => {
    const ref = '210000000003139471430009017';
    expect(findQrReference('21 00000 00003 13947 14300 09017.')).toBe(ref);
    expect(findQrReference('21 00000 00003 13947 14300 09017,')).toBe(ref);
    expect(findQrReference('QRR:210000000003139471430009017')).toBe(ref);
    expect(findQrReference('Ref.210000000003139471430009017.')).toBe(ref);
    expect(findQrReference('Ref.21 00000 00003 13947 14300 09017')).toBe(ref);
    expect(findQrReference('Betrag 120.00 21 00000')).toBe('');
  });
  it('accepts newline and nbsp between groups', () => {
    expect(findQrReference('21\n00000 00003 13947\u00a014300 09017')).toBe('210000000003139471430009017');
  });
  it('ignores digit runs with a wrong check digit or wrong length', () => {
    expect(findQrReference('Konto 210000000003139471430009018')).toBe('');
    expect(findQrReference('Betrag 120.00 am 20260101')).toBe('');
    expect(findQrReference(undefined)).toBe('');
  });
});

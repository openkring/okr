import { describe, expect, it } from 'vitest';

import { computeImportKeys, importKeyMaterial, sha256Hex } from './import-key.util';

const base = { iban: 'CH51', date: '20250714', amount: -12975, bankReference: '', rawText: 'KAUF BEXIO AG  Rapperswil' };

describe('import key', () => {
  it('material is iban|date|amount|reference|normalized text|occurrence', () => {
    expect(importKeyMaterial([base])).toEqual(['CH51|20250714|-12975||kauf bexio ag rapperswil|0']);
  });

  it('identical rows in one file get increasing occurrence indexes, in file order', () => {
    const m = importKeyMaterial([base, { ...base, rawText: 'OTHER' }, base, base]);
    expect(m[0].endsWith('|0')).toBe(true);
    expect(m[1]).toBe('CH51|20250714|-12975||other|0');
    expect(m[2].endsWith('|1')).toBe(true);
    expect(m[3].endsWith('|2')).toBe(true);
  });

  it('keys are stable, hex sha256, and differ by every field', async () => {
    const [k1] = await computeImportKeys([base]);
    const [k2] = await computeImportKeys([base]);
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    const variants = [
      { ...base, iban: 'CH52' }, { ...base, date: '20250715' }, { ...base, amount: -12976 },
      { ...base, bankReference: 'X' }, { ...base, rawText: 'KAUF BEXIO AG Rapperswil!' },
    ];
    const keys = await computeImportKeys(variants);
    expect(new Set([k1, ...keys]).size).toBe(6);
  });

  it('sha256Hex matches a known vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { detectFormat, parseStatement } from './format-registry';
import { BankImportError } from './types';

const pf = readFileSync(join(__dirname, 'fixtures/postfinance-sample.csv'), 'utf8');
const zkb = readFileSync(join(__dirname, 'fixtures/zkb-sample.csv'), 'utf8');
const yuh = readFileSync(join(__dirname, 'fixtures/yuh-sample.csv'), 'utf8');
const sq = readFileSync(join(__dirname, 'fixtures/swissquote-sample.txt'), 'utf8');

describe('format registry', () => {
  it('detects the fixtures and rejects garbage', () => {
    expect(detectFormat(pf)).toBe('postfinance');
    expect(detectFormat(zkb)).toBe('zkb');
    expect(detectFormat(yuh)).toBe('yuh');
    expect(detectFormat(sq)).toBe('swissquote');
    expect(detectFormat('hello;world\n1;2')).toBeUndefined();
    expect(detectFormat('')).toBeUndefined();
  });
  it('parseStatement dispatches and throws a typed error for unknown input', () => {
    expect(parseStatement(pf).format).toBe('postfinance');
    expect(parseStatement(zkb).rows.length).toBe(17);
    expect(parseStatement(yuh)).toMatchObject({ format: 'yuh', iban: '', warnings: [] });
    expect(parseStatement(sq)).toMatchObject({ format: 'swissquote', iban: 'CH1208781000000012345', currency: 'CHF', warnings: [] });
    expect(() => parseStatement('nope')).toThrowError(BankImportError);
    try { parseStatement('nope'); } catch (e) { expect((e as BankImportError).code).toBe('unknown-format'); }
  });
});

describe('legacy ZKB layout', () => {
  const legacy = readFileSync(join(__dirname, 'fixtures/zkb-legacy-sample.csv'), 'utf8');
  it('is detected as zkb and passes the saldo check oldest-first', () => {
    expect(detectFormat(legacy)).toBe('zkb');
    const s = parseStatement(legacy);
    expect(s.rows.length).toBe(51);
    expect(s.warnings).toEqual([]);
  });
  it('flags a corrupted saldo on the right line when the file is oldest-first', () => {
    const s = parseStatement(legacy.replace('"20432.17"', '"20432.18"'));
    expect(s.warnings).toEqual([{ code: 'saldo-mismatch', lineNo: 53, detail: '2043217/2043218' }]);
  });
});

describe('GKB layout', () => {
  const gkb = readFileSync(join(__dirname, 'fixtures/gkb-sample.csv'), 'utf8');
  it('is detected as gkb and passes the saldo check newest-first', () => {
    expect(detectFormat(gkb)).toBe('gkb');
    const s = parseStatement(gkb);
    expect(s.rows.length).toBe(20);
    expect(s.warnings).toEqual([]);
  });
  it('flags a corrupted saldo on the right line', () => {
    const s = parseStatement(gkb.replace(';21889.05;', ';21889.06;'));
    expect(s.warnings).toEqual([{ code: 'saldo-mismatch', lineNo: 13, detail: '2188905/2188906' }]);
  });
});

describe('VZ layout', () => {
  const vz = readFileSync(join(__dirname, 'fixtures/vz-sample.csv'), 'utf8');
  it('is detected as vz and passes the saldo check newest-first', () => {
    expect(detectFormat(vz)).toBe('vz');
    const s = parseStatement(vz);
    expect(s).toMatchObject({ format: 'vz', iban: 'CH9300762011623852957', currency: 'CHF' });
    expect(s.rows.length).toBe(12);
    expect(s.warnings).toEqual([]);
  });
  it('flags a corrupted saldo on the right line', () => {
    const s = parseStatement(vz.replace(",CHF --10'000.00,CHF 4'222.55", ",CHF --10'000.00,CHF 4'222.56"));
    expect(s.warnings).toEqual([{ code: 'saldo-mismatch', lineNo: 2, detail: '422255/422256' }]);
  });
});

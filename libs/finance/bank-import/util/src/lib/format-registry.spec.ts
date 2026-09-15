import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { detectFormat, parseStatement } from './format-registry';
import { BankImportError } from './types';

const pf = readFileSync(join(__dirname, 'fixtures/postfinance-sample.csv'), 'utf8');
const zkb = readFileSync(join(__dirname, 'fixtures/zkb-sample.csv'), 'utf8');

describe('format registry', () => {
  it('detects both fixtures and rejects garbage', () => {
    expect(detectFormat(pf)).toBe('postfinance');
    expect(detectFormat(zkb)).toBe('zkb');
    expect(detectFormat('hello;world\n1;2')).toBeUndefined();
    expect(detectFormat('')).toBeUndefined();
  });
  it('parseStatement dispatches and throws a typed error for unknown input', () => {
    expect(parseStatement(pf).format).toBe('postfinance');
    expect(parseStatement(zkb).rows.length).toBe(17);
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

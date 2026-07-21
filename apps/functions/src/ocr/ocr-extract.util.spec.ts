import { describe, it, expect } from 'vitest';
import {
  normalizeVendor, matchRule, resolveDebitAccount, toCents,
  computeNextBookingNo, isBalanced, ocrResultId, type OcrRuleLite,
} from './ocr-extract.util';

describe('normalizeVendor', () => {
  it('lowercases, strips diacritics + legal suffixes + punctuation', () => {
    expect(normalizeVendor('MIGROS Zürich AG')).toBe('migros zurich');
    expect(normalizeVendor('Stämpfli AG')).toBe('stampfli');
    expect(normalizeVendor('  Coop  Genossenschaft ')).toBe('coop');
  });
});

describe('matchRule', () => {
  const rules: OcrRuleLite[] = [
    { okey: 'r1', ocrUsage: 'expense', party: 'migros', aliases: [], accountKey: 'a-food', rank: 1, active: true },
    { okey: 'r2', ocrUsage: 'expense', party: 'migros', aliases: [], accountKey: 'a-food-hi', rank: 5, active: true },
    { okey: 'r3', ocrUsage: 'invoice', party: 'stampfli', aliases: [], accountKey: 'a-boat', rank: 1, active: true },
    { okey: 'r4', ocrUsage: 'expense', party: 'sbb', aliases: ['cff', 'ffs'], accountKey: 'a-travel', rank: 1, active: true },
    { okey: 'r5', ocrUsage: 'expense', party: 'inactive', aliases: [], accountKey: 'a-x', rank: 9, active: false },
  ];

  it('matches normalized-contains and picks the highest rank', () => {
    expect(matchRule(rules, 'expense', 'MIGROS Zürich AG')?.okey).toBe('r2');
  });
  it('respects usage', () => {
    expect(matchRule(rules, 'invoice', 'MIGROS')?.okey).toBeUndefined();
  });
  it('matches on an alias', () => {
    expect(matchRule(rules, 'expense', 'CFF Genève')?.okey).toBe('r4');
  });
  it('ignores inactive rules', () => {
    expect(matchRule(rules, 'expense', 'Inactive Corp')).toBeUndefined();
  });
  it('returns undefined when nothing matches', () => {
    expect(matchRule(rules, 'expense', 'Unknown Shop')).toBeUndefined();
  });
});

describe('resolveDebitAccount', () => {
  it('prefers the rule account', () => {
    expect(resolveDebitAccount('a-rule', 'a-llm', 'a-default')).toBe('a-rule');
  });
  it('falls back to the llm hint', () => {
    expect(resolveDebitAccount('', 'a-llm', 'a-default')).toBe('a-llm');
  });
  it('falls back to the default account', () => {
    expect(resolveDebitAccount('', '', 'a-default')).toBe('a-default');
  });
});

describe('toCents', () => {
  it('converts major units to integer cents, rounding', () => {
    expect(toCents(49.9)).toBe(4990);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(undefined as unknown as number)).toBe(0);
  });
});

describe('computeNextBookingNo', () => {
  it('returns max+1 for the year, 1 for an empty set', () => {
    expect(computeNextBookingNo([], 2026)).toBe(1);
    expect(computeNextBookingNo(
      [{ date: '20260101', bookingNo: 3 }, { date: '20260615', bookingNo: 7 }, { date: '20250101', bookingNo: 99 }],
      2026,
    )).toBe(8);
  });
});

describe('isBalanced', () => {
  it('true when debit sum equals credit sum', () => {
    expect(isBalanced([{ debit: 4990, credit: 0 }, { debit: 0, credit: 4990 }])).toBe(true);
    expect(isBalanced([{ debit: 4990, credit: 0 }, { debit: 0, credit: 4980 }])).toBe(false);
  });
});

describe('ocrResultId', () => {
  it('is deterministic and Firestore-safe (no slashes)', () => {
    const a = ocrResultId('tenant/scs/ocr/expense/exp1/beleg.pdf', '17280001');
    const b = ocrResultId('tenant/scs/ocr/expense/exp1/beleg.pdf', '17280001');
    expect(a).toBe(b);
    expect(a).not.toContain('/');
  });
});

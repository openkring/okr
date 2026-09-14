import { describe, expect, it } from 'vitest';

import { BankImportRowModel, BankRuleModel } from '@okr/shared-models';

import { applyRules, matchRule, normalizeText } from './bank-rule.util';

function rule(p: Partial<BankRuleModel>): BankRuleModel {
  return { ...new BankRuleModel('t1', 'acc1'), okey: 'r', accountKey: 'a1', title: 'T', ...p };
}
function row(p: Partial<BankImportRowModel>): BankImportRowModel {
  return { ...new BankImportRowModel('t1', 'acc1'), okey: 'k', ...p };
}

describe('normalizeText', () => {
  it('lower-cases, strips diacritics, collapses whitespace, keeps punctuation', () => {
    expect(normalizeText('  PREIS FÜR DIE   KONTOFÜHRUNG ')).toBe('preis fur die kontofuhrung');
    expect(normalizeText('PAYPAL *IONOS SE')).toBe('paypal *ionos se');
    expect(normalizeText('FIREFOO.APP BERLIN')).toBe('firefoo.app berlin');
  });
  it('handles empty and undefined-ish input', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(undefined as unknown as string)).toBe('');
  });
});

describe('matchRule', () => {
  const text = 'KAUF/ONLINE-SHOPPING VOM 01.12.2025 KARTEN NR. XXXX1434 GOOGLE CLOUD 9WVFMR DUBLIN';

  it('contains / startsWith / endsWith test the normalized text against the stored term', () => {
    expect(matchRule(text, [rule({ condition: 'contains', term: 'google cloud' })]).result?.ruleKey).toBe('r');
    expect(matchRule(text, [rule({ condition: 'startsWith', term: 'kauf/online' })]).result?.ruleKey).toBe('r');
    expect(matchRule(text, [rule({ condition: 'endsWith', term: 'dublin' })]).result?.ruleKey).toBe('r');
    expect(matchRule(text, [rule({ condition: 'startsWith', term: 'dublin' })]).result).toBeUndefined();
  });

  it('ignores inactive rules', () => {
    expect(matchRule(text, [rule({ term: 'google', active: false })]).result).toBeUndefined();
  });

  it('highest priority wins, then the longer term, then the smaller okey', () => {
    const a = rule({ okey: 'a', term: 'google', priority: 0, title: 'A' });
    const b = rule({ okey: 'b', term: 'google cloud', priority: 0, title: 'B' });
    const c = rule({ okey: 'c', term: 'goo', priority: 5, title: 'C' });
    expect(matchRule(text, [a, b]).result?.title).toBe('B');
    expect(matchRule(text, [a, b, c]).result?.title).toBe('C');
    const d = rule({ okey: 'd', term: 'google', priority: 0, title: 'D' });
    expect(matchRule(text, [d, a]).result?.title).toBe('A');
  });

  it('regex rules substitute capture groups into the title', () => {
    const r = rule({ condition: 'regex', term: 'google cloud ([a-z0-9]+) dublin', title: 'Google Cloud $1' });
    expect(matchRule(text, [r]).result?.title).toBe('Google Cloud 9wvfmr');
  });

  it('an invalid regex is skipped and reported, other rules still match', () => {
    const bad = rule({ okey: 'bad', condition: 'regex', term: '(' });
    const ok = rule({ okey: 'ok', term: 'google' });
    const out = matchRule(text, [bad, ok]);
    expect(out.result?.ruleKey).toBe('ok');
    expect(out.invalidRuleKeys).toEqual(['bad']);
  });

  it('carries account and vat code into the result', () => {
    const r = rule({ term: 'google', accountKey: '6500', vatCodeKey: 'VST_81' });
    expect(matchRule(text, [r]).result).toEqual({ ruleKey: 'r', title: 'T', accountKey: '6500', vatCodeKey: 'VST_81' });
  });
});

describe('applyRules', () => {
  const rules = [rule({ okey: 'g', term: 'google', title: 'Google', accountKey: '6500' })];

  it('maps matching rows and unmaps the rest', () => {
    const { rows } = applyRules([row({ okey: '1', rawText: 'GOOGLE CLOUD' }), row({ okey: '2', rawText: 'TESLA' })], rules);
    expect(rows[0]).toMatchObject({ status: 'mapped', title: 'Google', accountKey: '6500', ruleKey: 'g' });
    expect(rows[1]).toMatchObject({ status: 'unmapped', ruleKey: '', accountKey: '' });
  });

  it('leaves one-off assignments, posted and error rows untouched', () => {
    const oneOff = row({ okey: '1', rawText: 'GOOGLE', ruleKey: '', accountKey: '4000', title: 'Manual', status: 'mapped' });
    const posted = row({ okey: '2', rawText: 'GOOGLE', status: 'posted', bookingKey: 'bank-2' });
    const err = row({ okey: '3', rawText: 'GOOGLE', status: 'error', error: 'period-locked' });
    const { rows } = applyRules([oneOff, posted, err], rules);
    expect(rows[0]).toMatchObject({ title: 'Manual', accountKey: '4000', status: 'mapped' });
    expect(rows[1].status).toBe('posted');
    expect(rows[2].status).toBe('error');
  });

  it('re-maps a row whose previous rule no longer matches', () => {
    const stale = row({ okey: '1', rawText: 'TESLA', ruleKey: 'old', accountKey: '1', title: 'Old', status: 'mapped' });
    const { rows } = applyRules([stale], rules);
    expect(rows[0]).toMatchObject({ status: 'unmapped', ruleKey: '', accountKey: '', title: '' });
  });
});

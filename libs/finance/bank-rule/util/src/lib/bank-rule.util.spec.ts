import { describe, expect, it } from 'vitest';

import { BankImportRowModel, BankRuleModel } from '@okr/shared-models';

import { applyRules, matchRule, normalizeRuleForSave, normalizeText, proposeBankRule, seedBankRule } from './bank-rule.util';

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

describe('normalizeRuleForSave', () => {
  it('normalizes a contains/startsWith/endsWith term', () => {
    expect(normalizeRuleForSave(rule({ term: ' Google  CLOUD ', condition: 'contains' })).term).toBe('google cloud');
  });

  it('leaves a regex term untouched apart from trimming', () => {
    expect(normalizeRuleForSave(rule({ term: ' Goo(gle) ', condition: 'regex' })).term).toBe('Goo(gle)');
  });

  it('coerces priority to a number', () => {
    expect(normalizeRuleForSave(rule({ priority: '3' as never })).priority).toBe(3);
    expect(normalizeRuleForSave(rule({ priority: undefined as never })).priority).toBe(0);
  });

  it('trims the title', () => {
    expect(normalizeRuleForSave(rule({ title: '  Google Cloud  ' })).title).toBe('Google Cloud');
  });
});

describe('seedBankRule', () => {
  it('does not let the seed override tenants, accountingTenantId or okey', () => {
    const fresh = new BankRuleModel('t1', 'acc1');
    const seeded = seedBankRule(fresh, { tenants: ['x'], accountingTenantId: 'z', okey: 'y' } as Partial<BankRuleModel>);
    expect(seeded.tenants).toEqual(['t1']);
    expect(seeded.accountingTenantId).toBe('acc1');
    expect(seeded.okey).toBe(fresh.okey);
  });

  it('applies the rest of the seed', () => {
    const fresh = new BankRuleModel('t1', 'acc1');
    const seeded = seedBankRule(fresh, { term: 'google', title: 'Google', condition: 'contains' });
    expect(seeded).toMatchObject({ term: 'google', title: 'Google', condition: 'contains' });
  });

  it('returns the fresh rule unchanged when no seed is given', () => {
    const fresh = new BankRuleModel('t1', 'acc1');
    expect(seedBankRule(fresh)).toEqual(fresh);
  });
});

describe('proposeBankRule', () => {
  it('uses the payee as term and title when the payee occurs in the bank text', () => {
    expect(proposeBankRule(row({ rawText: 'Gutschrift HANS MUSTER', payee: 'HANS MUSTER' })))
      .toEqual({ condition: 'contains', term: 'HANS MUSTER', title: 'Hans Muster' });
  });

  it('falls back to the bank text when the payee is a synthesized name that never occurs in it (GKB, VZ, Swissquote)', () => {
    // a 'contains gkb' rule could never match 'Zinsbelastung' — the matcher only sees rawText
    expect(proposeBankRule(row({ rawText: 'Zinsbelastung', payee: 'GKB' })))
      .toEqual({ condition: 'contains', term: 'Zinsbelastung', title: 'Zinsbelastung' });
    // the account number varies per mortgage tranche — a term carrying it would match one tranche only
    expect(proposeBankRule(row({ rawText: 'Zinsbelastung 10 384.747.204', payee: 'GKB' })))
      .toEqual({ condition: 'contains', term: 'Zinsbelastung', title: 'Zinsbelastung' });
    expect(proposeBankRule(row({ rawText: 'Gebühr Bankpaket', payee: 'VZ' })))
      .toEqual({ condition: 'contains', term: 'Gebühr Bankpaket', title: 'Gebühr Bankpaket' });
  });

  it('compares payee and text after normalization (case, diacritics)', () => {
    expect(proposeBankRule(row({ rawText: 'Miete ZKB Schrankfach', payee: 'ZKB' })).term).toBe('ZKB');
    expect(proposeBankRule(row({ rawText: 'Gutschrift MÜLLER AG', payee: 'Muller AG' })).term).toBe('Muller AG');
  });

  it('takes the first three words of the bank text when there is no payee; an all-caps text is title-cased', () => {
    expect(proposeBankRule(row({ rawText: 'KAUF/ONLINE-SHOPPING VOM 01.12.2025 KARTEN NR. XXXX1434', payee: '' })))
      .toEqual({ condition: 'contains', term: 'KAUF/ONLINE-SHOPPING VOM', title: 'Kauf/online-shopping Vom' });
    expect(proposeBankRule(row({ rawText: 'Netflix Amsterdam, NL', payee: '' })).title).toBe('Netflix Amsterdam, NL');
  });

  it('keeps the numeric words when nothing else is left', () => {
    expect(proposeBankRule(row({ rawText: '4711 0815', payee: '' })).term).toBe('4711 0815');
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

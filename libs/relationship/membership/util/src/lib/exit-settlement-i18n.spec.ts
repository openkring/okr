import { describe, expect, it } from 'vitest';
import type { Signal } from '@angular/core';
import {
  choiceConfirmText, chfFrancs, chfRappen, EXIT_SETTLEMENT_I18N_KEYS, fillExitText, manualReasonText, settleErrorText, settlementHintText,
  type ExitSettlementI18n,
} from './exit-settlement-i18n';
import type { ExitSettlement, ManualReason } from './exit-settlement';

// every signal returns its own key, so a test sees which key a helper picked
const i18n = Object.fromEntries(
  Object.entries(EXIT_SETTLEMENT_I18N_KEYS).map(([k, v]) => [k, (() => v) as Signal<string>]),
) as ExitSettlementI18n;
const key = (name: keyof typeof EXIT_SETTLEMENT_I18N_KEYS): string => EXIT_SETTLEMENT_I18N_KEYS[name];

describe('settleErrorText', () => {
  const known: [string, keyof typeof EXIT_SETTLEMENT_I18N_KEYS][] = [
    ['task-done', 'error_task_done'], ['choice-not-offered', 'error_choice_not_offered'],
    ['already-refunded', 'error_already_refunded'], ['adjust-in-progress', 'error_adjust_in_progress'],
    ['invalid-claim', 'error_invalid_claim'], ['state-changed', 'error_state_changed'], ['no-membership', 'error_no_membership'],
    ['no-books', 'error_no_books'],
  ];
  it.each(known)('maps %s', (reason, k) => expect(settleErrorText(i18n, reason)).toBe(key(k)));
  it('falls back to the generic error for unknown and missing reasons', () => {
    expect(settleErrorText(i18n, 'whatever')).toBe(key('error'));
    expect(settleErrorText(i18n, undefined)).toBe(key('error'));
  });
});

describe('amount formatting', () => {
  it('formats Rappen', () => {
    expect(chfRappen(10050)).toBe('100.50');
    expect(chfRappen(0)).toBe('0.00');
  });
  it('formats francs', () => {
    expect(chfFrancs(100)).toBe('100.00');
    expect(chfFrancs(12.5)).toBe('12.50');
  });
});

describe('fillExitText', () => {
  it('replaces known placeholders', () => {
    expect(fillExitText('CHF {amount} bis {year}', { amount: '10.00', year: 2026 })).toBe('CHF 10.00 bis 2026');
  });
  it('leaves unknown placeholders untouched', () => {
    expect(fillExitText('{amount} {other}', { amount: '1' })).toBe('1 {other}');
  });
});

describe('manualReasonText', () => {
  const cases: [ManualReason, keyof typeof EXIT_SETTLEMENT_I18N_KEYS][] = [
    ['no-invoice', 'manual_no_invoice'], ['ambiguous-invoice', 'manual_ambiguous_invoice'], ['books-mismatch', 'manual_books_mismatch'],
    ['bexio-entry-year', 'manual_bexio_entry_year'], ['category-change', 'manual_category_change'], ['no-price', 'manual_no_price'],
    ['billed-exceeds-invoice', 'manual_billed_exceeds_invoice'],
  ];
  it.each(cases)('maps %s', (reason, k) => expect(manualReasonText(i18n, reason)).toBe(key(k)));
  it('returns empty for no reason', () => expect(manualReasonText(i18n, '')).toBe(''));
});

describe('choiceConfirmText', () => {
  it('picks the confirmation of each choice', () => {
    expect(choiceConfirmText(i18n, 'refund')).toBe(key('confirm_refund'));
    expect(choiceConfirmText(i18n, 'adjust-invoice')).toBe(key('confirm_adjust'));
    expect(choiceConfirmText(i18n, 'extend')).toBe(key('confirm_extend'));
  });
});

describe('settlementHintText', () => {
  const s = (over: Partial<ExitSettlement>): ExitSettlement => ({
    case: 'none', exitYear: 2026, months: 10, yearlyFr: 600, dueFr: 500, billedFr: 600, overpaidRappen: 0, refundRappen: 0,
    choices: [], manualReason: '', accountKey: '', ...over,
  });
  it('explains the missing «Rechnung anpassen» on an unpaid bexio invoice', () => {
    expect(settlementHintText(i18n, s({ case: 'unpaid', shape: 'bexio', choices: ['extend'] }))).toBe(key('bexio_unpaid'));
  });
  it('no hint for an unpaid native invoice', () => {
    expect(settlementHintText(i18n, s({ case: 'unpaid', shape: 'native', choices: ['adjust-invoice', 'extend'] }))).toBe('');
  });
  it('partial-short and manual reasons', () => {
    expect(settlementHintText(i18n, s({ case: 'partial-short' }))).toBe(key('partial_short'));
    expect(settlementHintText(i18n, s({ case: 'manual', manualReason: 'category-change' }))).toBe(key('manual_category_change'));
  });
});

import { Signal } from '@angular/core';

import type { ExitSettlement, ManualReason, SettlementChoice } from './exit-settlement';

/** Scope of the lazily loaded strings: libs/relationship/membership/feature/src/i18n. */
const PFX = '@relationship/membership/feature.';

/** Texts of the exit settlement card (spec 1.105). `{amount}` / `{date}` / `{months}` are filled by the caller. */
export const EXIT_SETTLEMENT_I18N_KEYS = {
  title:                 PFX + 'exitSettlement.title',
  months:                PFX + 'exitSettlement.months',
  yearly:                PFX + 'exitSettlement.yearly',
  due:                   PFX + 'exitSettlement.due',
  billed:                PFX + 'exitSettlement.billed',
  assumption:            PFX + 'exitSettlement.assumption',
  paid:                  PFX + 'exitSettlement.paid',
  refund:                PFX + 'exitSettlement.refund',
  adjust:                PFX + 'exitSettlement.adjust',
  extend:                PFX + 'exitSettlement.extend',
  confirm_refund:        PFX + 'exitSettlement.confirm.refund',
  confirm_adjust:        PFX + 'exitSettlement.confirm.adjust',
  confirm_extend:        PFX + 'exitSettlement.confirm.extend',
  done:                  PFX + 'exitSettlement.done',
  no_action:             PFX + 'exitSettlement.noAction',
  manual_no_invoice:               PFX + 'exitSettlement.manual.no-invoice',
  manual_ambiguous_invoice:        PFX + 'exitSettlement.manual.ambiguous-invoice',
  manual_books_mismatch:           PFX + 'exitSettlement.manual.books-mismatch',
  manual_bexio_entry_year:         PFX + 'exitSettlement.manual.bexio-entry-year',
  manual_category_change:          PFX + 'exitSettlement.manual.category-change',
  manual_no_price:                 PFX + 'exitSettlement.manual.no-price',
  manual_billed_exceeds_invoice:   PFX + 'exitSettlement.manual.billed-exceeds-invoice',
  partial_short:         PFX + 'exitSettlement.partialShort',
  bexio_unpaid:          PFX + 'exitSettlement.bexioUnpaid',
  error:                 PFX + 'exitSettlement.error.generic',
  error_task_done:           PFX + 'exitSettlement.error.task-done',
  error_choice_not_offered:  PFX + 'exitSettlement.error.choice-not-offered',
  error_already_refunded:    PFX + 'exitSettlement.error.already-refunded',
  error_adjust_in_progress:  PFX + 'exitSettlement.error.adjust-in-progress',
  error_invalid_claim:       PFX + 'exitSettlement.error.invalid-claim',
  error_state_changed:       PFX + 'exitSettlement.error.state-changed',
  error_no_membership:       PFX + 'exitSettlement.error.no-membership',
  done_toast:            PFX + 'exitSettlement.doneToast',
} satisfies Record<string, string>;

export type ExitSettlementI18n = { [K in keyof typeof EXIT_SETTLEMENT_I18N_KEYS]: Signal<string> };

/** Replaces `{name}` placeholders (translateAll strips double-brace params). */
export function fillExitText(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function chfRappen(rappen: number): string {
  return (rappen / 100).toFixed(2);
}

export function chfFrancs(fr: number): string {
  return fr.toFixed(2);
}

export function manualReasonText(i18n: ExitSettlementI18n, reason: ManualReason): string {
  switch (reason) {
    case 'no-invoice': return i18n.manual_no_invoice();
    case 'ambiguous-invoice': return i18n.manual_ambiguous_invoice();
    case 'books-mismatch': return i18n.manual_books_mismatch();
    case 'bexio-entry-year': return i18n.manual_bexio_entry_year();
    case 'category-change': return i18n.manual_category_change();
    case 'no-price': return i18n.manual_no_price();
    case 'billed-exceeds-invoice': return i18n.manual_billed_exceeds_invoice();
    default: return '';
  }
}

/** The warning line of the card: why there is no (or a limited) way forward; '' when none. */
export function settlementHintText(i18n: ExitSettlementI18n, s: ExitSettlement): string {
  if (s.case === 'partial-short') return i18n.partial_short();
  // §5.2: a bexio invoice cannot be adjusted here, so «Rechnung anpassen» is missing
  if (s.case === 'unpaid' && s.shape === 'bexio') return i18n.bexio_unpaid();
  return manualReasonText(i18n, s.manualReason);
}

/** i18n text for a refusal reason of the settle callable; unknown reasons fall back to the generic error. */
export function settleErrorText(i18n: ExitSettlementI18n, reason: string | undefined): string {
  switch (reason) {
    case 'task-done': return i18n.error_task_done();
    case 'choice-not-offered': return i18n.error_choice_not_offered();
    case 'already-refunded': return i18n.error_already_refunded();
    case 'adjust-in-progress': return i18n.error_adjust_in_progress();
    case 'invalid-claim': return i18n.error_invalid_claim();
    case 'state-changed': return i18n.error_state_changed();
    case 'no-membership': return i18n.error_no_membership();
    default: return i18n.error();
  }
}

export function choiceConfirmText(i18n: ExitSettlementI18n, choice: SettlementChoice): string {
  return choice === 'refund' ? i18n.confirm_refund() : choice === 'adjust-invoice' ? i18n.confirm_adjust() : i18n.confirm_extend();
}

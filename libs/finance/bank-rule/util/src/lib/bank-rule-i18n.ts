import { Signal } from '@angular/core';

/** MUST mirror the lib's path under libs/: libs/finance/bank-rule/util → '@finance/bank-rule/util.' */
const PFX = '@finance/bank-rule/util.';

export const BANK_RULE_I18N_KEYS = {
  singular:            PFX + 'singular',
  plural:              PFX + 'plural',
  empty:               PFX + 'empty',
  inactive:            PFX + 'inactive',

  create:              PFX + 'create.label',
  create_conf:         PFX + 'create.conf',
  create_error:        PFX + 'create.error',
  update:              PFX + 'update.label',
  update_conf:         PFX + 'update.conf',
  update_error:        PFX + 'update.error',
  delete:              PFX + 'delete.label',
  delete_conf:         PFX + 'delete.conf',
  delete_error:        PFX + 'delete.error',
  view:                PFX + 'view.label',
  cancel:              PFX + 'cancel.label',
  save:                PFX + 'save.label',

  condition_label:     PFX + 'condition.label',
  condition_helper:    PFX + 'condition.helper',
  condition_contains:  PFX + 'condition.contains',
  condition_startsWith: PFX + 'condition.startsWith',
  condition_endsWith:  PFX + 'condition.endsWith',
  condition_regex:     PFX + 'condition.regex',
  term_label:          PFX + 'term.label',
  term_placeholder:    PFX + 'term.placeholder',
  term_helper:         PFX + 'term.helper',
  term_stored_as:      PFX + 'term.storedAs',
  title_label:         PFX + 'title.label',
  title_placeholder:   PFX + 'title.placeholder',
  title_helper:        PFX + 'title.helper',
  account_label:       PFX + 'account.label',
  account_helper:      PFX + 'account.helper',
  vat_label:           PFX + 'vat.label',
  vat_helper:          PFX + 'vat.helper',
  priority_label:      PFX + 'priority.label',
  priority_helper:     PFX + 'priority.helper',
  active_label:        PFX + 'active.label',
  notes_label:         PFX + 'notes.label',
  notes_placeholder:   PFX + 'notes.placeholder',

  as_title:            PFX + 'as.title',
  as_edit:             PFX + 'as.edit',
  as_delete:           PFX + 'as.delete',
  changeConfirmation_cancel: PFX + 'changeConfirmation.cancel',
  changeConfirmation_ok:     PFX + 'changeConfirmation.ok',
} satisfies Record<string, string>;

export type BankRuleI18n = { [K in keyof typeof BANK_RULE_I18N_KEYS]: Signal<string> };

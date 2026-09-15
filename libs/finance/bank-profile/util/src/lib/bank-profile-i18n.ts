import { Signal } from '@angular/core';

/** MUST mirror the lib's path under libs/: libs/finance/bank-profile/util → '@finance/bank-profile/util.' */
const PFX = '@finance/bank-profile/util.';

export const BANK_PROFILE_I18N_KEYS = {
  singular:            PFX + 'singular',
  plural:              PFX + 'plural',
  empty:               PFX + 'empty',

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

  format_label:        PFX + 'format.label',
  format_helper:       PFX + 'format.helper',
  format_postfinance:  PFX + 'format.postfinance',
  format_zkb:          PFX + 'format.zkb',
  format_yuh:          PFX + 'format.yuh',
  format_vz:           PFX + 'format.vz',
  format_gkb:          PFX + 'format.gkb',
  format_swissquote:   PFX + 'format.swissquote',
  iban_label:          PFX + 'iban.label',
  iban_placeholder:    PFX + 'iban.placeholder',
  iban_helper:         PFX + 'iban.helper',
  bankName_label:      PFX + 'bankName.label',
  bankName_placeholder: PFX + 'bankName.placeholder',
  bankName_helper:     PFX + 'bankName.helper',
  account_label:       PFX + 'account.label',
  account_helper:      PFX + 'account.helper',
  currency_label:      PFX + 'currency.label',
  currency_helper:     PFX + 'currency.helper',
  notes_label:         PFX + 'notes.label',
  notes_placeholder:   PFX + 'notes.placeholder',

  as_title:            PFX + 'as.title',
  as_edit:             PFX + 'as.edit',
  as_delete:           PFX + 'as.delete',
  changeConfirmation_cancel: PFX + 'changeConfirmation.cancel',
  changeConfirmation_ok:     PFX + 'changeConfirmation.ok',
} satisfies Record<string, string>;

export type BankProfileI18n = { [K in keyof typeof BANK_PROFILE_I18N_KEYS]: Signal<string> };

import { Signal } from '@angular/core';

const PFX = '@finance/expense/feature.';

export const EXPENSE_I18N_KEYS = {
  list_title:         PFX + 'list.title',
  new_title:          PFX + 'new.title',
  detail_title:       PFX + 'detail.title',
  submit_iban:        PFX + 'submit.iban',
  submit_upload:      PFX + 'submit.upload',
  submit_saving:      PFX + 'submit.saving',
  submit_booking:     PFX + 'submit.booking',
  submit_done:        PFX + 'submit.done',
  submit_error:       PFX + 'submit.error',
  status_draft:       PFX + 'status.draft',
  status_processing:  PFX + 'status.processing',
  status_validated:   PFX + 'status.validated',
  status_error:       PFX + 'status.error',
  status_posted:      PFX + 'status.posted',
} satisfies Record<string, string>;

export type ExpenseI18n = { [K in keyof typeof EXPENSE_I18N_KEYS]: Signal<string> };

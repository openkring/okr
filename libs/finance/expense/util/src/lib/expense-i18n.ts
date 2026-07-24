import { Signal } from '@angular/core';

const PFX = '@finance/expense/feature.';

export const EXPENSE_I18N_KEYS = {
  list_title_my:      PFX + 'list.titleMy',
  list_title_all:     PFX + 'list.titleAll',
  list_empty:         PFX + 'list.empty',
  new_title:          PFX + 'new.title',
  detail_title:       PFX + 'detail.title',
  submit_iban:        PFX + 'submit.iban',
  submit_upload:      PFX + 'submit.upload',
  submit_saving:      PFX + 'submit.saving',
  submit_done:        PFX + 'submit.done',
  submit_error:       PFX + 'submit.error',
  status_draft:       PFX + 'status.draft',
  status_processing:  PFX + 'status.processing',
  status_validated:   PFX + 'status.validated',
  status_error:       PFX + 'status.error',
  status_posted:      PFX + 'status.posted',
  as_title:           PFX + 'action.title',
  action_view:        PFX + 'action.view',
  action_delete:      PFX + 'action.delete',
  action_redoOcr:     PFX + 'action.redoOcr',
  action_openTask:    PFX + 'action.openTask',
  action_openBooking: PFX + 'action.openBooking',
  action_cancel:      PFX + 'action.cancel',
  delete_confirm:     PFX + 'delete.confirm',
  delete_error:       PFX + 'delete.error',
  redo_conf:          PFX + 'redo.conf',
  redo_error:         PFX + 'redo.error',
} satisfies Record<string, string>;

export type ExpenseI18n = { [K in keyof typeof EXPENSE_I18N_KEYS]: Signal<string> };

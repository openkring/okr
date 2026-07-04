import { Signal } from '@angular/core';

const PFX = '@finance/booking/feature.';

export const BOOKING_I18N_KEYS = {
  list_title:                  PFX + 'list.title',
  empty:                       PFX + 'empty',
  as_title:                    PFX + 'as.title',
  cancel:                      PFX + 'cancel.label',
  col_date:                    PFX + 'col.date',
  col_credit:                  PFX + 'col.credit',
  col_debit:                   PFX + 'col.debit',
  col_name:                    PFX + 'col.name',
  col_amount:                  PFX + 'col.amount',
  view:                        PFX + 'view.label',
  edit:                        PFX + 'edit.label',
  create:                      PFX + 'create.label',
  delete:                      PFX + 'delete.label',
  action_createReceipt:        PFX + 'action.createReceipt',
  action_counterpartyRequired: PFX + 'action.counterpartyRequired',
  action_noAddress:            PFX + 'action.noAddress',
  action_failed:               PFX + 'action.failed',
  read_only_banner:            PFX + 'readonly.banner',
} satisfies Record<string, string>;

export type BookingI18n = { [K in keyof typeof BOOKING_I18N_KEYS]: Signal<string> };

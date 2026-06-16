import { Signal } from '@angular/core';

const PFX = '@finance/booking/feature.';

export const BOOKING_I18N_KEYS = {
  list_title:                  PFX + 'list.title',
  empty:                       PFX + 'empty',
  view:                        PFX + 'view.label',
  edit:                        PFX + 'edit.label',
  create:                      PFX + 'create.label',
  delete:                      PFX + 'delete.label',
  action_createReceipt:        PFX + 'action.createReceipt',
  action_counterpartyRequired: PFX + 'action.counterpartyRequired',
  action_noAddress:            PFX + 'action.noAddress',
  action_failed:               PFX + 'action.failed',
} satisfies Record<string, string>;

export type BookingI18n = { [K in keyof typeof BOOKING_I18N_KEYS]: Signal<string> };

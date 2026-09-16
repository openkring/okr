import { Signal } from '@angular/core';

const PFX = '@finance/period/feature.';

export const PERIOD_I18N_KEYS = {
  list_title:         PFX + 'list.title',
  empty:              PFX + 'empty',
  locked_label:       PFX + 'locked.label',
  lock_action:        PFX + 'lock.action',
  unlock_action:      PFX + 'unlock.action',
  bookings_label:     PFX + 'bookings.label',
  show_bookings_action: PFX + 'showBookings.action',
  show_balance_action: PFX + 'showBalance.action',
  show_income_statement_action: PFX + 'showIncomeStatement.action',
  create_action:      PFX + 'create.action',
  create_prompt:      PFX + 'create.prompt',
  create_placeholder: PFX + 'create.placeholder',
  create_invalid:     PFX + 'create.invalid',
  create_exists:      PFX + 'create.exists',

  as_title:           '@actionsheet.title',
  cancel:             '@cancel',
} satisfies Record<string, string>;

export type PeriodI18n = { [K in keyof typeof PERIOD_I18N_KEYS]: Signal<string> };

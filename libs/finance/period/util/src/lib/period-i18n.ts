import { Signal } from '@angular/core';

const PFX = '@finance/period/feature.';

export const PERIOD_I18N_KEYS = {
  list_title:    PFX + 'list.title',
  empty:         PFX + 'empty',
  locked_label:  PFX + 'locked.label',
  lock_action:   PFX + 'lock.action',
  unlock_action: PFX + 'unlock.action',
} satisfies Record<string, string>;

export type PeriodI18n = { [K in keyof typeof PERIOD_I18N_KEYS]: Signal<string> };

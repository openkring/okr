import { Signal } from '@angular/core';

const PFX = '@finance.journal.';

export const JOURNAL_I18N_KEYS = {
  list_title:           PFX + 'list.title',
  as_view:              PFX + 'actionsheet.view',
  as_showDebitAccount:  PFX + 'actionsheet.showDebitAccount',
  as_showCreditAccount: PFX + 'actionsheet.showCreditAccount',
  cancel:               '@cancel',
} satisfies Record<string, string>;

export type JournalI18n = { [K in keyof typeof JOURNAL_I18N_KEYS]: Signal<string> };

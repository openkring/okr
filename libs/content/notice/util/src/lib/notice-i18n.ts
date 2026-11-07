// libs/content/notice/util/src/lib/notice-i18n.ts
import type { Signal } from '@angular/core';

const PFX = '@content/notice/feature.';

/** Keys of the notice page and the Mitteilungen section (spec 1.145 §10). */
export const NOTICE_I18N_KEYS = {
  title:            PFX + 'title',
  from:             PFX + 'from',
  sent:             PFX + 'sent',
  attachments:      PFX + 'attachments',
  not_found:        PFX + 'not_found',
  attachment_error: PFX + 'attachment_error',
  empty:            PFX + 'empty',
  more:             PFX + 'more',
} satisfies Record<string, string>;

export type NoticeI18n = { [K in keyof typeof NOTICE_I18N_KEYS]: Signal<string> };

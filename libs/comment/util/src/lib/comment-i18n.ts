import { Signal } from '@angular/core';

export const COMMENT_LIST_I18N_KEYS = {
  comments:             '@comment/feature.comments',
  empty:                '@comment/feature.empty',
  add_title:            '@comment/feature.add.title',
  add_placeholder:      '@comment/feature.add.placeholder',
} satisfies Record<string, string>;

export type CommentListI18n = { [K in keyof typeof COMMENT_LIST_I18N_KEYS]: Signal<string> };

import { Signal } from '@angular/core';

export const COMMENT_LIST_I18N_KEYS = {
  comments:             '@comment/feature.comments',
  empty:                '@comment/feature.empty',
  add_title:            '@comment/feature.add.title',
  add_placeholder:      '@comment/feature.add.placeholder',
  // comment-input / comment-header labels (own @comment/ui scope, replacing the legacy global @input.comment.*)
  input_label:          '@comment/ui.input.comment.label',
  input_placeholder:    '@comment/ui.input.comment.placeholder',
  header_date:          '@comment/ui.input.comment.date',
  header_author:        '@comment/ui.input.comment.authorName',
  header_label:         '@comment/ui.input.comment.label',
} satisfies Record<string, string>;

export type CommentListI18n = { [K in keyof typeof COMMENT_LIST_I18N_KEYS]: Signal<string> };

import { Signal } from '@angular/core';

const PFX_FEATURE = '@comment/feature.';
const PFX_UI = '@comment/ui.';

export const COMMENT_LIST_I18N_KEYS = {
  comments:             PFX_FEATURE + 'comments',
  empty:                PFX_FEATURE + 'empty',
  read_only:            PFX_FEATURE + 'readOnly',
  // composer (own @comment/ui scope)
  input_placeholder:    PFX_UI + 'composer.placeholder',
  send:                 PFX_UI + 'composer.send',
  attach:               PFX_UI + 'composer.attach',
  emoji:                PFX_UI + 'composer.emoji',
  clear:                PFX_UI + 'composer.clear',
  remove_attachment:    PFX_UI + 'composer.removeAttachment',
  uploading:            PFX_UI + 'composer.uploading',
} satisfies Record<string, string>;

export type CommentListI18n = { [K in keyof typeof COMMENT_LIST_I18N_KEYS]: Signal<string> };

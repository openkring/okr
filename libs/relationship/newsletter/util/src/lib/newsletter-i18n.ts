import { Signal } from '@angular/core';

const PFX = '@relationship/newsletter/feature.';

export const NEWSLETTER_I18N_KEYS = {
  subscribers:         PFX + 'subscribers',
  empty:               PFX + 'empty',
  since:               PFX + 'since',
  source_form:         PFX + 'source.form',
  source_import:       PFX + 'source.import',
  source_app:          PFX + 'source.app',
  versand:             PFX + 'versand',
  unsubscribe:         PFX + 'unsubscribe',
  // single braces `{name}`, filled with `fill()`
  unsubscribe_confirm: PFX + 'unsubscribe_confirm',
  unsubscribe_conf:    PFX + 'unsubscribe_conf',
  unsubscribe_error:   PFX + 'unsubscribe_error',
  not_allowed:         PFX + 'not_allowed',
  not_found:           PFX + 'not_found',
  my_title:            PFX + 'my_title',
  leave:               PFX + 'leave',
  leave_notice:        PFX + 'leave_notice',
  // single braces `{name}`, filled with `fill()`
  leave_confirm:       PFX + 'leave_confirm',
  leave_done:          PFX + 'leave_done',
  leave_error:         PFX + 'leave_error',
  import             : PFX + 'import',
  import_title       : PFX + 'import_title',
  import_hint        : PFX + 'import_hint',
  import_file        : PFX + 'import_file',
  import_run         : PFX + 'import_run',
  import_running     : PFX + 'import_running',
  import_error       : PFX + 'import_error',
  import_no_rows     : PFX + 'import_no_rows',
  import_too_many    : PFX + 'import_too_many',
  import_result      : PFX + 'import_result',
  import_imported    : PFX + 'import_imported',
  import_already     : PFX + 'import_already',
  import_matched     : PFX + 'import_matched',
  import_ambiguous   : PFX + 'import_ambiguous',
  import_invalid     : PFX + 'import_invalid',
  as_title:            '@actionsheet.title',
  cancel:              '@cancel',
} satisfies Record<string, string>;

export type NewsletterI18n = { [K in keyof typeof NEWSLETTER_I18N_KEYS]: Signal<string> };

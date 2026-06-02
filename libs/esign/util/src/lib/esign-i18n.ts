import { Signal } from '@angular/core';

const PFX = '@esign/feature.';

export const ESIGN_I18N_KEYS = {
  list_title:      PFX + 'list.title',
  empty:           PFX + 'empty',
  ok:              '@ok',
  cancel:          '@cancel',
  delete_error:    PFX + 'delete.error',
  send_error:      PFX + 'send.error',
  upload_error:    PFX + 'upload.error',
  scan_no_fields:  PFX + 'scan.no_fields',
  as_view:         PFX + 'actionsheet.view',
  as_doc_view:     PFX + 'actionsheet.doc_view',
  as_doc_share:    PFX + 'actionsheet.doc_share',
  as_doc_send:     PFX + 'actionsheet.doc_send',
  as_delete:       PFX + 'actionsheet.delete',
} satisfies Record<string, string>;

export type EsignI18n = { [K in keyof typeof ESIGN_I18N_KEYS]: Signal<string> };

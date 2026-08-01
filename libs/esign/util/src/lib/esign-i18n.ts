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

  close:           PFX + 'close',
  send:            PFX + 'send.label',
  retry:           PFX + 'retry',
  send_ok:         PFX + 'send.ok',
  send_failed:     PFX + 'send.failed',

  // send-by-email modal
  email_title:               PFX + 'email.title',
  email_sent:                PFX + 'email.sent',
  recipients_label:          PFX + 'email.recipients.label',
  recipients_placeholder:    PFX + 'email.recipients.placeholder',
  recipients_helper:         PFX + 'email.recipients.helper',
  subject_label:             PFX + 'email.subject.label',
  subject_placeholder:       PFX + 'email.subject.placeholder',
  body_label:                PFX + 'email.body.label',
  body_placeholder:          PFX + 'email.body.placeholder',
  include_pdf_label:         PFX + 'email.include_pdf.label',

  // send-document modal
  document_title:            PFX + 'document.title',
  uploading:                 PFX + 'document.uploading',
  scanning:                  PFX + 'document.scanning',
  no_fields_hint:            PFX + 'document.no_fields_hint',
  signees_detected:          PFX + 'document.signees_detected',
  page:                      PFX + 'document.page',
  initiator_label:           PFX + 'document.initiator.label',
  initiator_placeholder:     PFX + 'document.initiator.placeholder',
  initiator_helper:          PFX + 'document.initiator.helper',
  comment_label:             PFX + 'document.comment.label',
  comment_placeholder:       PFX + 'document.comment.placeholder',
  signature_mode_label:      PFX + 'document.signature_mode.label',
  signature_mode_timestamp:  PFX + 'document.signature_mode.timestamp',
  signature_mode_advanced:   PFX + 'document.signature_mode.advanced',
  signature_mode_qualified:  PFX + 'document.signature_mode.qualified',
  jurisdiction_label:        PFX + 'document.jurisdiction.label',
  jurisdiction_zertes:       PFX + 'document.jurisdiction.zertes',
  jurisdiction_eidas:        PFX + 'document.jurisdiction.eidas',
  send_mail_label:           PFX + 'document.send_mail.label',
  send_mail_all:             PFX + 'document.send_mail.all',
  send_mail_others:          PFX + 'document.send_mail.others',
  send_mail_none:            PFX + 'document.send_mail.none',
} satisfies Record<string, string>;

export type EsignI18n = { [K in keyof typeof ESIGN_I18N_KEYS]: Signal<string> };

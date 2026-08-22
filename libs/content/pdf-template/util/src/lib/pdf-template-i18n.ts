import { Signal } from '@angular/core';

const PFX = '@content/pdf-template/feature.';

export const TEMPLATE_I18N_KEYS = {
  template:         PFX + 'template',
  templates:        PFX + 'templates',
  list_title:       PFX + 'list.title',
  empty:            PFX + 'empty',

  archive:          PFX + 'archive.label',

  create:           PFX + 'create.label',
  create_conf:      PFX + 'create.conf',
  create_error:     PFX + 'create.error',

  delete:           PFX + 'delete.label',
  delete_confirm:   PFX + 'delete.confirm',
  delete_conf:      PFX + 'delete.conf',
  delete_error:     PFX + 'delete.error',

  duplicate:        PFX + 'duplicate.label',

  preview:          PFX + 'preview.label',
  preview_error:    PFX + 'preview.error',

  publish:          PFX + 'publish.label',
  publish_conf:     PFX + 'publish.conf',
  publish_error:    PFX + 'publish.error',

  save:             '@save.label',
  save_draft_conf:  PFX + 'save.draft.conf',
  save_draft_error: PFX + 'save.draft.error',

  update:           PFX + 'update.label',
  update_conf:      PFX + 'update.conf',
  update_error:     PFX + 'update.error',

  view:             PFX + 'view.label',
  revert:           PFX + 'revert.label',
  revert_conf:      PFX + 'revert.conf',
  revert_error:     PFX + 'revert.error',

  name:             '@name.label',
  category:   PFX + 'category.label',
  language:   PFX + 'language.label',
  status:     PFX + 'status.label',
  version:    PFX + 'version.label',
  html:       PFX + 'html.label',
  css:        PFX + 'css.label',
  
  // edit page
  edit_fallback_name:  PFX + 'edit.fallback_name',
  edit_published:      PFX + 'edit.published',
  edit_draft:          PFX + 'edit.draft',
  edit_publish:        PFX + 'edit.publish',
  tab_metadata:        PFX + 'edit.tab.metadata',
  tab_html:            PFX + 'edit.tab.html',
  tab_preview:         PFX + 'edit.tab.preview',
  cat_invoice:         PFX + 'edit.category.invoice',
  cat_expense:         PFX + 'edit.category.expense',
  cat_report:          PFX + 'edit.category.report',
  cat_dunning:         PFX + 'edit.category.dunning',
  cat_other:           PFX + 'edit.category.other',
  output_format:       PFX + 'edit.output_format',
  sample_data:         PFX + 'edit.sample_data',
  qr_slip:             PFX + 'edit.qr_slip',
  qr_slip_amount:      PFX + 'edit.qr_slip_amount',
  payee_org:           PFX + 'edit.payee_org',
  html_placeholder:    PFX + 'edit.html_placeholder',
  preview_send:        PFX + 'edit.preview_send',
  preview_download:    PFX + 'edit.preview_download',
  preview_none:        PFX + 'edit.preview_none',

  // publish modal
  publish_title:       PFX + 'publish.title',
  publish_changelog:   PFX + 'publish.changelog',
  publish_changelog_ph:PFX + 'publish.changelog_placeholder',

  description:      '@description',
  as_title:         '@actionsheet.title',
  ok:               '@ok',
  cancel:           '@cancel',

} satisfies Record<string, string>;

export type TemplateI18n = { [K in keyof typeof TEMPLATE_I18N_KEYS]: Signal<string> };

/** Keys for DocButton (generate a document from a template). */
export const DOC_BUTTON_I18N_KEYS = {
  generate:         PFX + 'doc.generate.label',
  generate_pending: PFX + 'doc.generate.pending',
  generate_error:   PFX + 'doc.generate.error',
} satisfies Record<string, string>;

export type DocButtonI18n = { [K in keyof typeof DOC_BUTTON_I18N_KEYS]: Signal<string> };

/** Keys for PdfPreviewModal (preview / download / send a generated document). */
export const PDF_PREVIEW_I18N_KEYS = {
  title:       PFX + 'doc.preview.title',
  frame:       PFX + 'doc.preview.frame',
  unavailable: PFX + 'doc.preview.unavailable',
  empty:       PFX + 'doc.preview.empty',
  close:       PFX + 'doc.close.label',
  download:    PFX + 'doc.download.label',
  send:        PFX + 'doc.send.label',
} satisfies Record<string, string>;

export type PdfPreviewI18n = { [K in keyof typeof PDF_PREVIEW_I18N_KEYS]: Signal<string> };

/** Keys for EmailComposerModal (compose + send the generated document by email). */
export const EMAIL_COMPOSER_I18N_KEYS = {
  title:            PFX + 'composer.title',
  /** Header when no document is attached (plain / bulk mail). */
  title_plain:      PFX + 'composer.title_plain',

  to_label:         PFX + 'composer.to.label',
  to_placeholder:   PFX + 'composer.to.placeholder',
  from_label:       PFX + 'composer.from.label',
  from_placeholder: PFX + 'composer.from.placeholder',
  from_warning:     PFX + 'composer.from.warning',
  from_unknown:     PFX + 'composer.from.unknown',
  cc_label:         PFX + 'composer.cc.label',
  cc_placeholder:   PFX + 'composer.cc.placeholder',
  bcc_label:        PFX + 'composer.bcc.label',
  bcc_placeholder:  PFX + 'composer.bcc.placeholder',
  subject_label:    PFX + 'composer.subject.label',
  subject_prefix:   PFX + 'composer.subject.prefix',

  attachment_add:   PFX + 'composer.attachment.add',

  segment_editor:   PFX + 'composer.segment.editor',
  segment_preview:  PFX + 'composer.segment.preview',
  segment_list:     PFX + 'composer.segment.list',
  preview_empty:    PFX + 'composer.preview.empty',
  preview_frame:    PFX + 'composer.preview.frame',
  list_empty:       PFX + 'composer.list.empty',

  send:             PFX + 'doc.send.label',
  /** The bulk-send job document could not be written — nothing was sent. */
  send_queue_error: PFX + 'composer.send.queue_error',
  revert:           PFX + 'composer.revert.label',
  copy_conf:        '@copy.conf',
} satisfies Record<string, string>;

export type EmailComposerI18n = { [K in keyof typeof EMAIL_COMPOSER_I18N_KEYS]: Signal<string> };

/**
 * Keys of messages that carry runtime parameters. They must be resolved with
 * `I18nService.translate(key, params)` — NOT via `translateAll`, which passes no params and
 * would strip the `{{ … }}` placeholders.
 */
export const EMAIL_COMPOSER_MSG_KEYS = {
  send_conf:           PFX + 'composer.send.conf',
  send_error:          PFX + 'composer.send.error',
  attachment_toolarge: PFX + 'composer.attachment.toolarge',
} satisfies Record<string, string>;

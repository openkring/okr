import { Signal } from '@angular/core';

const PFX = '@forms/feature.';

// ---------------------------------------------------------------------------
// form-definition.store
// ---------------------------------------------------------------------------

export const FORM_I18N_KEYS = {
  title:                      PFX + 'title',
  list_title:                 PFX + 'list.title',
  list_empty:                 PFX + 'list.empty',

  as_title:                   PFX + 'as.title',
  action_builder:             PFX + 'action.builder',
  action_settings:            PFX + 'action.settings',
  action_export_csv:          PFX + 'action.export_csv',
  action_export_pdf:          PFX + 'action.export_pdf',
  action_duplicate:           PFX + 'action.duplicate',
  action_archive:             PFX + 'action.archive',

  form_key:                   PFX + 'form.key.label',
  form_loading:               PFX + 'form.loading',
  form_not_found:             PFX + 'form.notfound',
  form_archived:              PFX + 'form.archived',

  field_title:                PFX + 'field.title',
  field_add:                  PFX + 'field.add',

  canvas_empty:               PFX + 'canvas_empty',
  library:                    PFX + 'library',
  key:                        PFX + 'key',
  label:                      PFX + 'label',
  required:                   PFX + 'required',
  width:                      PFX + 'width',
  help:                       PFX + 'help',
  preview:                    PFX + 'preview',

  mapping_choose:             PFX + 'mapping.choose',

  target_label:               PFX + 'target.label',
  target_collection:          PFX + 'target.collection',
  target_url:                 PFX + 'target.url',

  url_label:                  PFX + 'url.label',

  create:                     PFX + 'create.label',
  create_conf:                PFX + 'create.conf',
  create_error:               PFX + 'create.error',

  delete:                     PFX + 'delete.label',
  delete_confirm:             PFX + 'delete.confirm',
  delete_conf:                PFX + 'delete.conf',
  delete_error:               PFX + 'delete.error',

  submit:                     PFX + 'submit.label',
  submit_conf:                PFX + 'submit.conf',
  submit_error:               PFX + 'submit.error',

  update:                     PFX + 'update.label',
  update_conf:                PFX + 'update.conf',
  update_error:               PFX + 'update.error',

  // builder
  preview_empty:              PFX + 'builder.preview_empty',
  source_copy:                PFX + 'builder.source.copy',
  source_paste:               PFX + 'builder.source.paste',
  source_copied:              PFX + 'builder.source.copied',
  source_copy_failed:         PFX + 'builder.source.copy_failed',
  source_invalid_json:        PFX + 'builder.source.invalid_json',
  source_invalid_format:      PFX + 'builder.source.invalid_format',
  source_applied:             PFX + 'builder.source.applied',
  discard:                    PFX + 'builder.discard',

  // definition-edit modal
  def_create_title:           PFX + 'definition.create_title',
  def_edit_title:             PFX + 'definition.edit_title',
  def_name:                   PFX + 'definition.name',
  def_name_placeholder:       PFX + 'definition.name_placeholder',
  def_target_kind:            PFX + 'definition.target_kind',
  def_target_url_short:       PFX + 'definition.target_url_short',
  def_collection:             PFX + 'definition.collection',
  def_select_placeholder:     PFX + 'definition.select_placeholder',
  def_pdf_template:           PFX + 'definition.pdf_template',
  def_pdf_template_ph:        PFX + 'definition.pdf_template_placeholder',
  def_fields:                 PFX + 'definition.fields',

  // field-config modal
  field_text:                 PFX + 'field.text',
  field_label:                PFX + 'field.label',
  field_key:                  PFX + 'field.key',
  field_width_full:           PFX + 'field.width_full',
  field_width_half:           PFX + 'field.width_half',
  field_width_third:          PFX + 'field.width_third',
  field_placeholder:          PFX + 'field.placeholder',
  field_apply:                PFX + 'field.apply',

  // decrypt-files modal
  decrypt_title:              PFX + 'decrypt.title',
  decrypt_hint:               PFX + 'decrypt.hint',
  decrypt_password:           PFX + 'decrypt.password',
  decrypt_password_ph:        PFX + 'decrypt.password_placeholder',
  decrypt_running:            PFX + 'decrypt.running',
  decrypt_action:             PFX + 'decrypt.action',
  decrypt_failed:             PFX + 'decrypt.failed',

  // encryption-setup modal
  enc_title:                  PFX + 'encryption.title',
  enc_warning:                PFX + 'encryption.warning',
  enc_password:               PFX + 'encryption.password',
  enc_copied:                 PFX + 'encryption.copied',
  enc_confirm:                PFX + 'encryption.confirm',
  enc_saving:                 PFX + 'encryption.saving',
  enc_activate:               PFX + 'encryption.activate',

  close:                    '@shared/ui.close',
  description:              '@description',
  name:                     '@name.label',
  loading:                  '@loading',
  save:                     '@save.label',
  ok:                       '@ok',
  cancel:                   '@cancel'
} satisfies Record<string, string>;

export type FormI18n = { [K in keyof typeof FORM_I18N_KEYS]: Signal<string> };

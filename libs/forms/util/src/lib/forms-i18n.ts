import { Signal } from '@angular/core';

const PFX = '@forms/feature.';

// ---------------------------------------------------------------------------
// form-definition.store
// ---------------------------------------------------------------------------

export const FORM_I18N_KEYS = {
  title:                      PFX + 'title',
  list_title:                 PFX + 'list.title',
  list_empty:                 PFX + 'list.empty',

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
  delete_confirm:             PFX + 'delete.label',
  delete_conf:                PFX + 'delete.label',
  delete_error:               PFX + 'delete.label',

  submit:                     PFX + 'submit.label',
  submit_conf:                PFX + 'submit.conf',
  submit_error:               PFX + 'submit.error',

  update:                     PFX + 'update.label',
  update_conf:                PFX + 'update.conf',
  update_error:               PFX + 'update.error',

  description:              '@description',
  name:                     '@name.label',
  loading:                  '@loading',
  save:                     '@save.label',
  ok:                       '@ok',
  cancel:                   '@cancel'
} satisfies Record<string, string>;

export type FormI18n = { [K in keyof typeof FORM_I18N_KEYS]: Signal<string> };

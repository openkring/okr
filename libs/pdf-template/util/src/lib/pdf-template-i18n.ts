import { Signal } from '@angular/core';

const PFX = '@pdf-template/feature.';

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

  name_label:       PFX + 'name.label',
  category_label:   PFX + 'category.label',
  language_label:   PFX + 'language.label',
  status_label:     PFX + 'status.label',
  version_label:    PFX + 'version.label',
  html_label:       PFX + 'html.label',
  css_label:        PFX + 'css.label',
  
  as_title:         '@actionsheet.title',
  ok:               '@ok',
  cancel:           '@cancel',

} satisfies Record<string, string>;

export type TemplateI18n = { [K in keyof typeof TEMPLATE_I18N_KEYS]: Signal<string> };

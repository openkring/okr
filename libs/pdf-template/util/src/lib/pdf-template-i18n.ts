import { Signal } from '@angular/core';

const PFX = '@pdf-template/feature.';

export const TEMPLATE_I18N_KEYS = {
  list_title:       PFX + 'list.title',
  empty:            PFX + 'empty',
  ok:               '@ok',
  cancel:           '@cancel',
  save:             '@save.label',
  delete_confirm:   PFX + 'delete.confirm',
  as_edit:          PFX + 'actionsheet.edit',
  as_delete:        PFX + 'actionsheet.delete',
  as_duplicate:     PFX + 'actionsheet.duplicate',
  as_archive:       PFX + 'actionsheet.archive',
  as_preview:       PFX + 'actionsheet.preview',
  save_draft_conf:  PFX + 'save.draft.conf',
  save_draft_error: PFX + 'save.draft.error',
  publish_conf:     PFX + 'publish.conf',
  publish_error:    PFX + 'publish.error',
  delete_conf:      PFX + 'delete.conf',
  delete_error:     PFX + 'delete.error',
  preview_error:    PFX + 'preview.error',
  name_label:       PFX + 'name.label',
  category_label:   PFX + 'category.label',
  language_label:   PFX + 'language.label',
  status_label:     PFX + 'status.label',
  version_label:    PFX + 'version.label',
  html_label:       PFX + 'html.label',
  css_label:        PFX + 'css.label',
  preview_label:    PFX + 'preview.label',
} satisfies Record<string, string>;

export type TemplateI18n = { [K in keyof typeof TEMPLATE_I18N_KEYS]: Signal<string> };

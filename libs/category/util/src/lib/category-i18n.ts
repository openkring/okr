import { Signal } from '@angular/core';

const PFX = '@category/feature.';

export const CATEGORY_I18N_KEYS = {
  category:                 PFX + 'category',
  categories:               PFX + 'categories',
  description:              PFX + 'description',
  empty:                    PFX + 'empty',

  all_label:                PFX + 'all.label',
  all_description:          PFX + 'all.description',
  undefined_label:          PFX + 'undefined.label',
  undefined_description:    PFX + 'undefined.description',
  archived_label:           PFX + 'archived.label',
  archived_description:     PFX + 'archived.description',

  create:                   PFX + 'create.label',
  create_conf:              PFX + 'create.conf',
  create_error:             PFX + 'create.error',

  delete:                   PFX + 'delete.label',
  delete_confirm:           PFX + 'delete.confirm',
  delete_conf:              PFX + 'delete.conf',
  delete_error:             PFX + 'delete.error',

  update:                   PFX + 'update.label',
  update_conf:              PFX + 'update.conf',
  update_error:             PFX + 'update.error',

  select:                   PFX + 'select.label',
  view:                     PFX + 'view.label',

  as_title:                 '@actionsheet.title',
  ok:                       '@ok',
  cancel:                   '@cancel',
  save:                     '@save.label',

  bkey_label:               PFX + 'bkey.label',
  bkey_placeholder:         PFX + 'bkey.placeholder',
  bkey_helper:              PFX + 'bkey.helper',

  name_label:               PFX + 'name.label',
  name_placeholder:         PFX + 'name.placeholder',
  name_error:               PFX + 'name.error',
  name_helper:              PFX + 'name.helper',

  i18nBase_label:           PFX + 'i18n.label',
  i18nBase_placeholder:     PFX + 'i18n.placeholder',
  i18nBase_helper:          PFX + 'i18n.helper',

  notes_label:              PFX + 'notes.label',
  notes_placeholder:        PFX + 'notes.placeholder',

  items_label:              PFX + 'items.label',
  items_description:        PFX + 'items.description',
  items_empty:              PFX + 'items.empty'
} satisfies Record<string, string>;

export type CategoryI18n = { [K in keyof typeof CATEGORY_I18N_KEYS]: Signal<string> };

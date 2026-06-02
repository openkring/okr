import { Signal } from '@angular/core';

export const CATEGORY_I18N_KEYS = {
  categories:               '@category.categories',
  empty:                    '@category.empty',
  view:                     '@category.view',
  edit:                     '@category.edit',
  create:                   '@category.create',
  delete:                   '@category.delete',
  as_title:                 '@actionsheet.title',
  ok:                       '@ok',
  cancel:                   '@cancel',
  save:                     '@save.label',
  bkey_label:               '@category.bkey.label',
  bkey_placeholder:         '@category.bkey.placeholder',
  bkey_helper:              '@category.bkey.helper',
  name_label:               '@category.name.label',
  name_placeholder:         '@category.name.placeholder',
  name_helper:              '@category.name.helper',
  i18nBase_label:           '@category.i18nBase.label',
  i18nBase_placeholder:     '@category.i18nBase.placeholder',
  i18nBase_helper:          '@category.i18nBase.helper',
  notes_label:              '@category.notes.label',
  notes_placeholder:        '@category.notes.placeholder',
  translateItems_label:     '@category.translateItems.label',
  translateItems_helper:    '@category.translateItems.helper',
} satisfies Record<string, string>;

export type CategoryI18n = { [K in keyof typeof CATEGORY_I18N_KEYS]: Signal<string> };

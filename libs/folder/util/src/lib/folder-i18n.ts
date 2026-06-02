import { Signal } from '@angular/core';

export const FOLDER_I18N_KEYS = {
  delete_confirm:                  '@folder.operation.delete.confirm',
  plural:                          '@folder.plural',
  empty:                           '@folder.empty',
  changeConfirmation_ok:           '@folder/feature.changeConfirmation.ok',
  changeConfirmation_cancel:       '@folder/feature.changeConfirmation.cancel',
  changeConfirmation_confirmation: '@folder/feature.changeConfirmation.confirmation',
  name_label:               '@folder/ui.name.label',
  name_placeholder:         '@folder/ui.name.placeholder',
  name_helper:              '@folder/ui.name.helper',
  title_label:              '@folder/ui.title.label',
  title_placeholder:        '@folder/ui.title.placeholder',
  title_helper:             '@folder/ui.title.helper',
  description_label:        '@folder/ui.description.label',
  description_placeholder:  '@folder/ui.description.placeholder',
  as_edit:                  '@folder/feature.actionsheet.edit',
  as_delete:                '@folder/feature.actionsheet.delete',
  cancel:                   '@cancel',
} satisfies Record<string, string>;

export type FolderI18n = { [K in keyof typeof FOLDER_I18N_KEYS]: Signal<string> };

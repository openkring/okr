import { Signal } from '@angular/core';

export const FOLDER_I18N_KEYS = {
  as_title:                        '@actionsheet.title',
  delete_confirm:                  '@folder.operation.delete.confirm',
  plural:                          '@folder.plural',
  empty:                           '@folder.empty',
  changeConfirmation_ok:           '@content/folder/feature.changeConfirmation.ok',
  changeConfirmation_cancel:       '@content/folder/feature.changeConfirmation.cancel',
  changeConfirmation_confirmation: '@content/folder/feature.changeConfirmation.confirmation',
  name_label:               '@content/folder/ui.name.label',
  name_placeholder:         '@content/folder/ui.name.placeholder',
  name_helper:              '@content/folder/ui.name.helper',
  title_label:              '@content/folder/ui.title.label',
  title_placeholder:        '@content/folder/ui.title.placeholder',
  title_helper:             '@content/folder/ui.title.helper',
  description_label:        '@content/folder/ui.description.label',
  description_placeholder:  '@content/folder/ui.description.placeholder',
  membersMayUpload_label:   '@content/folder/ui.membersMayUpload.label',
  membersMayUpload_helper:  '@content/folder/ui.membersMayUpload.helper',
  create_label:             '@content/folder/feature.operation.create.label',
  edit_label:               '@content/folder/feature.operation.edit.label',
  view_label:               '@content/folder/feature.operation.view.label',
  as_edit:                  '@content/folder/feature.actionsheet.edit',
  as_delete:                '@content/folder/feature.actionsheet.delete',
  cancel:                   '@cancel',
} satisfies Record<string, string>;

export type FolderI18n = { [K in keyof typeof FOLDER_I18N_KEYS]: Signal<string> };

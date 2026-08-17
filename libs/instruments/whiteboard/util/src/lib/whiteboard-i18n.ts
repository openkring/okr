import { Signal } from '@angular/core';

const F = '@instruments/whiteboard/feature.';
const U = '@instruments/whiteboard/ui.';

/** Feature-level i18n keys for the whiteboard (list, editor page, item editor). */
export const WHITEBOARD_I18N_KEYS = {
  as_title:                  '@actionsheet.title',
  whiteboard:                F + 'whiteboard',
  plural:                    F + 'plural',
  desc:                      F + 'desc',
  empty:                     F + 'empty',

  create_label:              F + 'operation.create.label',
  edit_label:                F + 'operation.edit.label',
  view_label:                F + 'operation.view.label',
  delete_confirm:            F + 'operation.delete.confirm',

  changeConfirmation_ok:           F + 'changeConfirmation.ok',
  changeConfirmation_cancel:       F + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: F + 'changeConfirmation.confirmation',

  as_choose:                 F + 'actionsheet.choose',
  as_open:                   F + 'actionsheet.open',
  as_edit:                   F + 'actionsheet.edit',
  as_delete:                 F + 'actionsheet.delete',

  // editor toolbar
  addSticker:                F + 'editor.addSticker',
  addLabel:                  F + 'editor.addLabel',
  chooseTemplate:            F + 'editor.chooseTemplate',
  zoomIn:                    F + 'editor.zoomIn',
  zoomOut:                   F + 'editor.zoomOut',
  zoomReset:                 F + 'editor.zoomReset',
  emptyCanvas:               F + 'editor.emptyCanvas',

  cancel:                    '@cancel',
  save:                      '@save.label',
  ok:                        '@ok',
  done:                      F + 'done',

  // whiteboard fields (ui)
  name_label:                U + 'name.label',
  name_placeholder:          U + 'name.placeholder',
  name_helper:               U + 'name.helper',
  description_label:         U + 'description.label',
  description_placeholder:   U + 'description.placeholder',

  // item (sticker/label) editor fields (ui)
  itemText_label:            U + 'item.text.label',
  itemText_placeholder:      U + 'item.text.placeholder',
  itemColor_label:           U + 'item.color.label',
  itemOwner_label:           U + 'item.owner.label',
} satisfies Record<string, string>;

export type WhiteboardI18n = { [K in keyof typeof WHITEBOARD_I18N_KEYS]: Signal<string> };

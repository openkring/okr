import { Signal } from '@angular/core';

const PFX = '@cms/menu/feature.';

export const MENU_I18N_KEYS = {
  menus:                          PFX + 'menus',
  submenus:                       PFX + 'submenus',
  empty:                          PFX + 'empty',
  link:                           PFX + 'link',
  action:                         PFX + 'action',
  as_title:                       '@actionsheet.title',
  edit:                           PFX + 'edit',
  view:                           PFX + 'view',
  create:                         PFX + 'create',
  delete:                         PFX + 'delete',
  add_submenu:                    PFX + 'add.submenu',

  menu_main_aoc_title:            PFX + 'menu.main.aoc.title',

  description:                    PFX + 'description.menu',
  description_label:              PFX + 'description.label',
  description_placeholder:        PFX + 'description.placeholder',
  icon_label:                     PFX + 'icon.label',
  icon_placeholder:               PFX + 'icon.placeholder',
  icon_helper:                    PFX + 'icon.helper',
  label_label:                    PFX + 'label.label',
  label_placeholder:              PFX + 'label.placeholder',
  label_helper:                   PFX + 'label.helper',
  url_placeholder:                PFX + 'url.placeholder',
  url_helper:                     PFX + 'url.helper',
  url_label:                      PFX + 'url.label',
  category_plural:                PFX + 'category.plural',
  responsibility_export_raw:      PFX + 'responsibility.export.raw',
  content_section_plural:         PFX + 'content.section.plural',

  name_label:                     '@name.label',
  name_placeholder:               '@name.placeholder',
  name_helper:                    '@name.helper',
  cancel:                         '@cancel',
  ok:                             '@ok',
  save:                           '@save.label',
} satisfies Record<string, string>;

export type MenuI18n = { [K in keyof typeof MENU_I18N_KEYS]: Signal<string> };

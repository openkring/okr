import { Signal } from '@angular/core';

const PFX = '@cms/menu/feature.';

export const MENU_I18N_KEYS = {
  menus:                          PFX + 'menus',
  submenus:                       PFX + 'submenus',
  empty:                          PFX + 'empty',
  link:                           PFX + 'link',
  action:                         PFX + 'action',
  edit:                           PFX + 'edit',
  view:                           PFX + 'view',
  create:                         PFX + 'create',
  delete:                         PFX + 'delete',
  add_submenu:                    PFX + 'add.submenu',

  // menu entries are directly referenced
  menu_main_aoc_title:            PFX + 'main.aoc.title',

  description:                    PFX + 'description.menu',
  description_label:              PFX + 'description.label',
  description_placeholder:        PFX + 'description.placeholder',

  icon_label:                     PFX + 'icon.label',
  icon_placeholder:               PFX + 'icon.placeholder',
  icon_helper:                    PFX + 'icon.helper',

  // action 'toggle' only: alternate icon/label for the active state
  icon_alt_label:                 PFX + 'icon_alt.label',
  icon_alt_placeholder:           PFX + 'icon_alt.placeholder',
  icon_alt_helper:                PFX + 'icon_alt.helper',

  label_label:                    PFX + 'label.label',
  label_placeholder:              PFX + 'label.placeholder',
  label_helper:                   PFX + 'label.helper',

  label_alt_label:                PFX + 'label_alt.label',
  label_alt_placeholder:          PFX + 'label_alt.placeholder',
  label_alt_helper:               PFX + 'label_alt.helper',

  info_label:                     PFX + 'info.label',
  info_placeholder:               PFX + 'info.placeholder',
  info_helper:                    PFX + 'info.helper',

  url_placeholder:                PFX + 'url.placeholder',
  url_helper:                     PFX + 'url.helper',
  url_label:                      PFX + 'url.label',

  category_plural:                PFX + 'category.plural',
  responsibility_export_raw:      PFX + 'responsibility.operation.export.raw',
  content_section_plural:         PFX + 'content.section.plural',

  // menu_action is directly referenced
  menu_action_label:              PFX + 'menu_action.label',
  menu_action_helper:             PFX + 'menu_action.helper',

  // action 'main' only: layout of the main menu, and the indent of its submenu rows
  menu_type_label:                PFX + 'menu_type.label',
  submenu_offset_label:           PFX + 'submenu_offset.label',
  submenu_offset_placeholder:     PFX + 'submenu_offset.placeholder',
  submenu_offset_helper:          PFX + 'submenu_offset.helper',

  // action 'main', menuType 'static': the bullet / highlight / sub-entry look, and the cut-off hint
  static_group:                   PFX + 'static.group',
  static_bullet_color_label:      PFX + 'static.bullet_color.label',
  static_bullet_color_custom:     PFX + 'static.bullet_color.custom',
  static_color_primary:           PFX + 'static.color.primary',
  static_color_secondary:         PFX + 'static.color.secondary',
  static_color_tertiary:          PFX + 'static.color.tertiary',
  static_color_success:           PFX + 'static.color.success',
  static_color_warning:           PFX + 'static.color.warning',
  static_color_danger:            PFX + 'static.color.danger',
  static_color_light:             PFX + 'static.color.light',
  static_color_medium:            PFX + 'static.color.medium',
  static_color_dark:              PFX + 'static.color.dark',
  static_bullet_shape_label:      PFX + 'static.bullet_shape.label',
  static_bullet_shape_square:     PFX + 'static.bullet_shape.square',
  static_bullet_shape_round:      PFX + 'static.bullet_shape.round',
  static_bullet_shape_none:       PFX + 'static.bullet_shape.none',
  static_bullet_size_label:       PFX + 'static.bullet_size.label',
  static_bullet_size_placeholder: PFX + 'static.bullet_size.placeholder',
  static_bullet_size_helper:      PFX + 'static.bullet_size.helper',
  static_active_style_label:      PFX + 'static.active_style.label',
  static_active_style_bold:       PFX + 'static.active_style.bold',
  static_active_style_color:      PFX + 'static.active_style.color',
  static_active_style_underline:  PFX + 'static.active_style.underline',
  static_children_visibility_label:PFX + 'static.children_visibility.label',
  static_children_visibility_always:PFX + 'static.children_visibility.always',
  static_children_visibility_active:PFX + 'static.children_visibility.active',
  static_children_direction_label:PFX + 'static.children_direction.label',
  static_children_direction_horizontal:PFX + 'static.children_direction.horizontal',
  static_children_direction_vertical:PFX + 'static.children_direction.vertical',
  static_preview_label:           PFX + 'static.preview.label',
  static_preview_page:            PFX + 'static.preview.page',
  static_preview_active:          PFX + 'static.preview.active',
  // shown to admins in place of a row the static menu cannot draw (read by the layout, not the form)
  static_cut_warning:             PFX + 'static.cut_warning',
  // landmark name of the static block (screen readers)
  static_nav_label:               PFX + 'static.nav_label',

  // shown to admins in place of a `sub` row that reached a segmented bar
  bar_segment_sub:                PFX + 'bar.segment_sub',

  // account area at the end of the bar
  bar_account_menu:               PFX + 'bar.account_menu',
  bar_cookie_settings:            PFX + 'bar.cookie_settings',
  // the entry holding the rows that do not fit the bar
  bar_more:                       PFX + 'bar.more',

  error_save:                     PFX + 'error.save',
  error_load:                     PFX + 'error.load',
  error_delete:                   PFX + 'error.delete',

  // Ownership guard (see `classifyMenuOwnership`). `fork_confirm` gates a copy-on-write, so
  // its string uses SINGLE braces — `fill()`, not Transloco interpolation: `translateAll()`
  // resolves keys without params, and `{{name}}` would be substituted with an empty string.
  fork_confirm:                   PFX + 'ownership.fork_confirm',
  owner_catalogue:                PFX + 'ownership.catalogue',
  owner_forked:                   PFX + 'ownership.forked',
  owner_tenant:                   PFX + 'ownership.tenant',

  as_title:                       '@actionsheet.title',
  name_label:                     '@name.label',
  name_placeholder:               '@name.placeholder',
  name_helper:                    '@name.helper',
  cancel:                         '@cancel',
  ok:                             '@ok',
  save:                           '@save.label',
} satisfies Record<string, string>;

export type MenuI18n = { [K in keyof typeof MENU_I18N_KEYS]: Signal<string> };

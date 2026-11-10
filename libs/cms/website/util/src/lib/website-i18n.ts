import { Signal } from '@angular/core';

const PFX = '@cms/website/feature.';

/** Keys of the website sitemap UI (spec 1.153). Values live in the feature/ui libs' de.json. */
export const WEBSITE_I18N_KEYS = {
  // node types
  type_menu:                PFX + 'type.menu',
  type_page:                PFX + 'type.page',
  type_link:                PFX + 'type.link',

  // ActionSheet actions, in their fixed order
  action_add_menu:          PFX + 'action.addMenu',
  action_add_page:          PFX + 'action.addPage',
  action_add_link:          PFX + 'action.addLink',
  action_edit:              PFX + 'action.edit',
  action_move:              PFX + 'action.move',
  action_archive:           PFX + 'action.archive',
  action_edit_page:         PFX + 'action.editPage',
  action_copy_url:          PFX + 'action.copyUrl',

  // warnings, one per WebsiteWarning code
  warning_page_missing:     PFX + 'warning.pageMissing',
  warning_page_archived:    PFX + 'warning.pageArchived',
  warning_page_private:     PFX + 'warning.pagePrivate',
  warning_slug_duplicate:   PFX + 'warning.slugDuplicate',
  warning_page_duplicate:   PFX + 'warning.pageDuplicate',
  warning_link_invalid:     PFX + 'warning.linkInvalid',
  warning_home_missing:     PFX + 'warning.homeMissing',

  // move errors
  move_into_self:           PFX + 'move.intoSelf',
  move_not_menu:            PFX + 'move.notMenu',
  move_top_level:           PFX + 'move.topLevel',

  // form validation
  validation_labelRequired: PFX + 'validation.labelRequired',
  validation_labelTooLong:  PFX + 'validation.labelTooLong',
  validation_slugRequired:  PFX + 'validation.slugRequired',
  validation_slugPattern:   PFX + 'validation.slugPattern',
  validation_urlRequired:   PFX + 'validation.urlRequired',
  validation_urlPrefix:     PFX + 'validation.urlPrefix',
} satisfies Record<string, string>;

export type WebsiteI18n = { [K in keyof typeof WEBSITE_I18N_KEYS]: Signal<string> };

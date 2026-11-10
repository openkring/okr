import { Signal } from '@angular/core';

const PFX = '@cms/website/feature.';
const UI = '@cms/website/ui.';

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
  action_edit_entry:        PFX + 'action.editEntry',

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

  // sitemap page
  sitemap_title:            PFX + 'sitemap.title',
  sitemap_count:            PFX + 'sitemap.count',
  sitemap_empty:            PFX + 'sitemap.empty',
  sitemap_no_site:          PFX + 'sitemap.noSite',
  sitemap_create_site:      PFX + 'sitemap.createSite',
  sitemap_add_top:          PFX + 'sitemap.addTop',
  as_title:                 PFX + 'actionSheet.title',
  ok:                       PFX + 'ok',
  cancel:                   PFX + 'cancel',
  url_copied:               PFX + 'urlCopied',
  page_not_found:           PFX + 'pageNotFound',
  page_in_tree:             PFX + 'pageInTree',
  slug_taken:               PFX + 'slugTaken',

  // «Seite hinzufügen»
  add_page_title:           PFX + 'addPage.title',
  add_page_new:             PFX + 'addPage.new',
  add_page_existing:        PFX + 'addPage.existing',
  add_page_name:            PFX + 'addPage.name',
  add_page_name_ph:         PFX + 'addPage.namePlaceholder',
  add_page_public_confirm:  PFX + 'addPage.publicConfirm',
  picker_title:             PFX + 'picker.title',
  picker_empty:             PFX + 'picker.empty',

  // «Verschieben nach…»
  move_title:               PFX + 'move.title',
  move_current:             PFX + 'move.current',

  // «Archivieren»
  archive_confirm:          PFX + 'archive.confirm',
  archive_confirm_menu:     PFX + 'archive.confirmMenu',
  archive_confirm_page:     PFX + 'archive.confirmPage',

  // node edit modal + form (ui lib)
  edit_title_menu:          UI + 'edit.title.menu',
  edit_title_page:          UI + 'edit.title.page',
  edit_title_link:          UI + 'edit.title.link',
  new_title_menu:           UI + 'new.title.menu',
  new_title_link:           UI + 'new.title.link',
  save:                     UI + 'save',
  discard:                  UI + 'discard',
  label_label:              UI + 'field.label.label',
  label_placeholder:        UI + 'field.label.placeholder',
  label_helper:             UI + 'field.label.helper',
  slug_label:               UI + 'field.slug.label',
  slug_placeholder:         UI + 'field.slug.placeholder',
  slug_helper:              UI + 'field.slug.helper',
  slug_rename_hint:         UI + 'field.slug.renameHint',
  url_label:                UI + 'field.url.label',
  url_placeholder:          UI + 'field.url.placeholder',
  url_helper:               UI + 'field.url.helper',
  style_label:              UI + 'field.style.label',
  style_helper:             UI + 'field.style.helper',

  // tree row (ui lib)
  row_archived:             UI + 'row.archived',
  row_drafts_one:           UI + 'row.draftsOne',
  row_drafts:               UI + 'row.drafts',

  // form validation
  validation_labelRequired: PFX + 'validation.labelRequired',
  validation_labelTooLong:  PFX + 'validation.labelTooLong',
  validation_slugRequired:  PFX + 'validation.slugRequired',
  validation_slugPattern:   PFX + 'validation.slugPattern',
  validation_urlRequired:   PFX + 'validation.urlRequired',
  validation_urlPrefix:     PFX + 'validation.urlPrefix',
} satisfies Record<string, string>;

export type WebsiteI18n = { [K in keyof typeof WEBSITE_I18N_KEYS]: Signal<string> };

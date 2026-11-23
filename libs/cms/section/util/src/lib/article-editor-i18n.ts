import type { Signal } from '@angular/core';

import type { SectionI18n } from './section-i18n';

const PFX = '@cms/section/feature.';

/**
 * The texts of the article editor (spec 1.175): canvas, panel and modal. In a file of their own, not among SECTION_I18N_KEYS: those
 * are in the chunk of readers, and several section stores subscribe to every one of them. The editor resolves both:
 * `translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS }) as ArticleEditorI18n`.
 * A value in single braces is filled with `fill()` (`@okr/shared-util-core`).
 */
export const ARTICLE_EDITOR_I18N_KEYS = {
  // the block types
  article_editor_block_text:                    PFX + 'article.editor.block.text',
  article_editor_block_image:                   PFX + 'article.editor.block.image',
  article_editor_block_gallery:                 PFX + 'article.editor.block.gallery',
  article_editor_block_button:                  PFX + 'article.editor.block.button',
  article_editor_block_columns:                 PFX + 'article.editor.block.columns',
  article_editor_block_callout:                 PFX + 'article.editor.block.callout',
  article_editor_block_divider:                 PFX + 'article.editor.block.divider',
  article_editor_block_space:                   PFX + 'article.editor.block.space',
  article_editor_block_unknown:                 PFX + 'article.editor.block.unknown',
  // the library of blocks
  article_editor_library_title:                 PFX + 'article.editor.library.title',
  article_editor_library_add:                   PFX + 'article.editor.library.add',
  article_editor_library_hint:                  PFX + 'article.editor.library.hint',
  article_editor_library_hintTap:               PFX + 'article.editor.library.hintTap',
  article_editor_library_full:                  PFX + 'article.editor.library.full',
  // the panel of a block
  article_editor_panel_label:                   PFX + 'article.editor.panel.label',
  article_editor_panel_nothing:                 PFX + 'article.editor.panel.nothing',
  article_editor_panel_unknown:                 PFX + 'article.editor.panel.unknown',
  article_editor_panel_writeInArticle:          PFX + 'article.editor.panel.writeInArticle',
  article_editor_panel_look:                    PFX + 'article.editor.panel.look',
  article_editor_align_label:                   PFX + 'article.editor.align.label',
  article_editor_align_left:                    PFX + 'article.editor.align.left',
  article_editor_align_center:                  PFX + 'article.editor.align.center',
  article_editor_align_right:                   PFX + 'article.editor.align.right',
  article_editor_image_missing:                 PFX + 'article.editor.image.missing',
  article_editor_image_empty:                   PFX + 'article.editor.image.empty',
  article_editor_image_fromArticle:             PFX + 'article.editor.image.fromArticle',
  article_editor_image_pickEmpty:               PFX + 'article.editor.image.pickEmpty',
  article_editor_image_pickOne:                 PFX + 'article.editor.image.pickOne',
  article_editor_image_unnamed:                 PFX + 'article.editor.image.unnamed',
  article_editor_image_captionHidden:           PFX + 'article.editor.image.captionHidden',
  article_editor_image_link_label:              PFX + 'article.editor.image.link.label',
  article_editor_image_link_placeholder:        PFX + 'article.editor.image.link.placeholder',
  article_editor_image_link_helper:             PFX + 'article.editor.image.link.helper',
  article_editor_image_linkInactive:            PFX + 'article.editor.image.linkInactive',
  article_editor_image_linkMissing:             PFX + 'article.editor.image.linkMissing',
  article_editor_image_noUpload:                PFX + 'article.editor.image.noUpload',
  article_editor_image_columnWidth:             PFX + 'article.editor.image.columnWidth',
  article_editor_gallery_missing:               PFX + 'article.editor.gallery.missing',
  article_editor_columns_count:                 PFX + 'article.editor.columns.count',
  article_editor_columns_widths:                PFX + 'article.editor.columns.widths',
  article_editor_columns_preset:                PFX + 'article.editor.columns.preset',
  article_editor_columns_column:                PFX + 'article.editor.columns.column',
  article_editor_columns_size:                  PFX + 'article.editor.columns.size',
  article_editor_columns_stackReverse_label:    PFX + 'article.editor.columns.stackReverse.label',
  article_editor_columns_stackReverse_helper:   PFX + 'article.editor.columns.stackReverse.helper',
  article_editor_columns_invalid:               PFX + 'article.editor.columns.invalid',
  article_editor_tone_label:                    PFX + 'article.editor.tone.label',
  article_editor_tone_primary:                  PFX + 'article.editor.tone.primary',
  article_editor_tone_secondary:                PFX + 'article.editor.tone.secondary',
  article_editor_tone_tertiary:                 PFX + 'article.editor.tone.tertiary',
  article_editor_tone_neutral:                  PFX + 'article.editor.tone.neutral',
  article_editor_space_label:                   PFX + 'article.editor.space.label',
  article_editor_space_small:                   PFX + 'article.editor.space.small',
  article_editor_space_medium:                  PFX + 'article.editor.space.medium',
  article_editor_space_large:                   PFX + 'article.editor.space.large',
  // the panel of the article
  article_editor_article_title:                 PFX + 'article.editor.article.title',
  article_editor_article_settings:              PFX + 'article.editor.article.settings',
  article_editor_article_cover_title:           PFX + 'article.editor.article.cover.title',
  article_editor_article_cover_empty:           PFX + 'article.editor.article.cover.empty',
  article_editor_article_cover_helper:          PFX + 'article.editor.article.cover.helper',
  article_editor_article_date_label:            PFX + 'article.editor.article.date.label',
  article_editor_article_date_placeholder:      PFX + 'article.editor.article.date.placeholder',
  article_editor_article_date_helper:           PFX + 'article.editor.article.date.helper',
  // errors and translations
  article_editor_error_title:                   PFX + 'article.editor.error.title',
  article_editor_error_mark:                    PFX + 'article.editor.error.mark',
  article_editor_error_select:                  PFX + 'article.editor.error.select',
  article_editor_error_noGerman:                PFX + 'article.editor.error.noGerman',
  article_editor_outdated:                      PFX + 'article.editor.outdated',
  article_editor_outdatedField:                 PFX + 'article.editor.outdatedField',
  // the canvas
  article_editor_canvas_label:                  PFX + 'article.editor.canvas.label',
  article_editor_canvas_empty:                  PFX + 'article.editor.canvas.empty',
  article_editor_canvas_column:                 PFX + 'article.editor.canvas.column',
  article_editor_canvas_textPlaceholder:        PFX + 'article.editor.canvas.textPlaceholder',
  article_editor_canvas_textFailed:             PFX + 'article.editor.canvas.textFailed',
  article_editor_canvas_imagePlaceholder:       PFX + 'article.editor.canvas.imagePlaceholder',
  article_editor_canvas_galleryPlaceholder:     PFX + 'article.editor.canvas.galleryPlaceholder',
  article_editor_canvas_buttonPlaceholder:      PFX + 'article.editor.canvas.buttonPlaceholder',
  article_editor_canvas_dropHere:               PFX + 'article.editor.canvas.dropHere',
  article_editor_frame_toolbar:                 PFX + 'article.editor.frame.toolbar',
  article_editor_frame_drag:                    PFX + 'article.editor.frame.drag',
  article_editor_frame_up:                      PFX + 'article.editor.frame.up',
  article_editor_frame_down:                    PFX + 'article.editor.frame.down',
  article_editor_frame_duplicate:               PFX + 'article.editor.frame.duplicate',
  article_editor_frame_delete:                  PFX + 'article.editor.frame.delete',
  article_editor_add_label:                     PFX + 'article.editor.add.label',
  article_editor_add_below:                     PFX + 'article.editor.add.below',
  article_editor_add_atEnd:                     PFX + 'article.editor.add.atEnd',
  article_editor_add_inColumn:                  PFX + 'article.editor.add.inColumn',
  article_editor_add_title:                     PFX + 'article.editor.add.title',
  // the modal
  article_editor_title_edit:                    PFX + 'article.editor.title.edit',
  article_editor_title_new:                     PFX + 'article.editor.title.new',
  article_editor_device_label:                  PFX + 'article.editor.device.label',
  article_editor_device_mobile:                 PFX + 'article.editor.device.mobile',
  article_editor_device_tablet:                 PFX + 'article.editor.device.tablet',
  article_editor_device_desktop:                PFX + 'article.editor.device.desktop',
  article_editor_undo:                          PFX + 'article.editor.undo',
  article_editor_redo:                          PFX + 'article.editor.redo',
  article_editor_textTools:                     PFX + 'article.editor.textTools',
  article_editor_notice_noPicture:              PFX + 'article.editor.notice.noPicture',
  article_editor_notice_look:                   PFX + 'article.editor.notice.look',
  article_editor_notice_trial:                  PFX + 'article.editor.notice.trial',
  article_editor_notice_close:                  PFX + 'article.editor.notice.close',
  article_editor_save_running:                  PFX + 'article.editor.save.running',
  article_editor_save_conflict:                 PFX + 'article.editor.save.conflict',
  article_editor_save_force:                    PFX + 'article.editor.save.force',
  article_editor_save_back:                     PFX + 'article.editor.save.back',
  article_editor_save_gone:                     PFX + 'article.editor.save.gone',
  article_editor_save_offline:                  PFX + 'article.editor.save.offline',
  article_editor_save_failed:                   PFX + 'article.editor.save.failed',
  article_editor_save_trial:                    PFX + 'article.editor.save.trial',
  article_editor_discard_message:               PFX + 'article.editor.discard.message',
  article_editor_discard_confirm:               PFX + 'article.editor.discard.confirm',
  article_editor_discard_keep:                  PFX + 'article.editor.discard.keep',
  article_editor_openFailed:                    PFX + 'article.editor.openFailed',
} satisfies Record<string, string>;

/** What panel, canvas and modal are given: the texts of the editor and those of the section forms whose parts they reuse. */
export type ArticleEditorI18n = SectionI18n & { [K in keyof typeof ARTICLE_EDITOR_I18N_KEYS]: Signal<string> };

/** The name of a block type; «Unbekannter Block» for one this app does not know. */
export function blockTypeLabel(i18n: ArticleEditorI18n, type: string): string {
  const key = `article_editor_block_${type}`;
  return key in ARTICLE_EDITOR_I18N_KEYS ? i18n[key as keyof typeof ARTICLE_EDITOR_I18N_KEYS]() : i18n.article_editor_block_unknown();
}

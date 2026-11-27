import type { Signal } from '@angular/core';

import type { ArticleEditorI18n } from './article-editor-i18n';

const PFX = '@cms/section/feature.';

/**
 * The texts of the button editor: canvas, the panels of section and button. Like ARTICLE_EDITOR_I18N_KEYS in a file of their own, not
 * among SECTION_I18N_KEYS: only the editor needs them. It resolves `{ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...BUTTON_EDITOR_I18N_KEYS }`
 * (as ButtonEditorI18n): title, subtitle, intro, text tools, devices and undo are said as in the article editor.
 */
export const BUTTON_EDITOR_I18N_KEYS = {
  button_editor_panel_section:                  PFX + 'button.editor.panel.section',
  button_editor_panel_button:                   PFX + 'button.editor.panel.button',
  button_editor_panel_back:                     PFX + 'button.editor.panel.back',
  button_editor_panel_label:                    PFX + 'button.editor.panel.label',
  button_editor_panel_errors:                   PFX + 'button.editor.panel.errors',
  button_editor_canvas_hint:                    PFX + 'button.editor.canvas.hint',
  button_editor_canvas_select:                  PFX + 'button.editor.canvas.select',
  button_editor_canvas_noText:                  PFX + 'button.editor.canvas.noText',
  button_editor_label_label:                    PFX + 'button.editor.label.label',
  button_editor_label_placeholder:              PFX + 'button.editor.label.placeholder',
  button_editor_action_title:                   PFX + 'button.editor.action.title',
  button_editor_action_form:                    PFX + 'button.editor.action.form',
  button_editor_action_formHelper:              PFX + 'button.editor.action.formHelper',
  button_editor_action_emergency:               PFX + 'button.editor.action.emergency',
  button_editor_action_workflow:                PFX + 'button.editor.action.workflow',
  button_editor_action_none:                    PFX + 'button.editor.action.none',
  button_editor_action_upload:                  PFX + 'button.editor.action.upload',
  button_editor_action_uploadHelper:            PFX + 'button.editor.action.uploadHelper',
  button_editor_action_uploading:               PFX + 'button.editor.action.uploading',
  button_editor_look_title:                     PFX + 'button.editor.look.title',
  button_editor_look_main:                      PFX + 'button.editor.look.main',
  button_editor_look_outline:                   PFX + 'button.editor.look.outline',
  button_editor_look_link:                      PFX + 'button.editor.look.link',
  button_editor_look_round:                     PFX + 'button.editor.look.round',
  button_editor_look_emergency:                 PFX + 'button.editor.look.emergency',
  button_editor_look_own:                       PFX + 'button.editor.look.own',
  button_editor_size_title:                     PFX + 'button.editor.size.title',
  button_editor_size_s:                         PFX + 'button.editor.size.s',
  button_editor_size_m:                         PFX + 'button.editor.size.m',
  button_editor_size_l:                         PFX + 'button.editor.size.l',
  button_editor_size_wide:                      PFX + 'button.editor.size.wide',
  button_editor_size_own:                       PFX + 'button.editor.size.own',
  button_editor_icon_title:                     PFX + 'button.editor.icon.title',
  button_editor_icon_none:                      PFX + 'button.editor.icon.none',
  button_editor_icon_start:                     PFX + 'button.editor.icon.start',
  button_editor_icon_end:                       PFX + 'button.editor.icon.end',
  button_editor_icon_only:                      PFX + 'button.editor.icon.only',
  button_editor_icon_choose:                    PFX + 'button.editor.icon.choose',
  button_editor_layout_title:                   PFX + 'button.editor.layout.title',
  button_editor_layout_ratio:                   PFX + 'button.editor.layout.ratio',
  button_editor_custom_title:                   PFX + 'button.editor.custom.title',
  button_editor_custom_helper:                  PFX + 'button.editor.custom.helper',
} satisfies Record<string, string>;

export type ButtonEditorI18n = ArticleEditorI18n & { [K in keyof typeof BUTTON_EDITOR_I18N_KEYS]: Signal<string> };

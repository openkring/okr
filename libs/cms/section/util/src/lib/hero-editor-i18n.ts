import type { Signal } from '@angular/core';

import type { ArticleEditorI18n } from './article-editor-i18n';

const PFX = '@cms/section/feature.';

/**
 * The texts of the hero editor: canvas and the panels of section, cover, logo and button. Like BUTTON_EDITOR_I18N_KEYS in a file of
 * their own: only the editor needs them. It resolves `{ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...HERO_EDITOR_I18N_KEYS }`
 * (as HeroEditorI18n): title, subtitle, intro, devices and undo are said as in the article editor; heights, focus, gradient and the
 * button fields as in the former hero form (`hero_*`, `cta_*`).
 */
export const HERO_EDITOR_I18N_KEYS = {
  hero_editor_panel_section:                    PFX + 'hero.editor.panel.section',
  hero_editor_panel_cover:                      PFX + 'hero.editor.panel.cover',
  hero_editor_panel_logo:                       PFX + 'hero.editor.panel.logo',
  hero_editor_panel_back:                       PFX + 'hero.editor.panel.back',
  hero_editor_panel_label:                      PFX + 'hero.editor.panel.label',
  hero_editor_panel_errors:                     PFX + 'hero.editor.panel.errors',
  hero_editor_canvas_hint:                      PFX + 'hero.editor.canvas.hint',
  hero_editor_canvas_cover:                     PFX + 'hero.editor.canvas.cover',
  hero_editor_canvas_logo:                      PFX + 'hero.editor.canvas.logo',
  hero_editor_canvas_addLogo:                   PFX + 'hero.editor.canvas.addLogo',
  hero_editor_canvas_buttonPlaceholder:         PFX + 'hero.editor.canvas.buttonPlaceholder',
  hero_editor_cover_noImage:                    PFX + 'hero.editor.cover.noImage',
  hero_editor_height_own:                       PFX + 'hero.editor.height.own',
  hero_editor_gradient_title:                   PFX + 'hero.editor.gradient.title',
  hero_editor_advanced_title:                   PFX + 'hero.editor.advanced.title',
  hero_editor_advanced_helper:                  PFX + 'hero.editor.advanced.helper',
  hero_editor_logo_size_title:                  PFX + 'hero.editor.logo.size.title',
  hero_editor_logo_size_s:                      PFX + 'hero.editor.logo.size.s',
  hero_editor_logo_size_m:                      PFX + 'hero.editor.logo.size.m',
  hero_editor_logo_size_l:                      PFX + 'hero.editor.logo.size.l',
  hero_editor_logo_shape_title:                 PFX + 'hero.editor.logo.shape.title',
  hero_editor_logo_shape_square:                PFX + 'hero.editor.logo.shape.square',
  hero_editor_logo_shape_rounded:               PFX + 'hero.editor.logo.shape.rounded',
  hero_editor_logo_shape_round:                 PFX + 'hero.editor.logo.shape.round',
  hero_editor_logo_own:                         PFX + 'hero.editor.logo.own',
  hero_editor_logo_custom_title:                PFX + 'hero.editor.logo.custom.title',
  hero_editor_logo_custom_helper:               PFX + 'hero.editor.logo.custom.helper',
  hero_editor_button_forward:                   PFX + 'hero.editor.button.forward',
} satisfies Record<string, string>;

export type HeroEditorI18n = ArticleEditorI18n & { [K in keyof typeof HERO_EDITOR_I18N_KEYS]: Signal<string> };

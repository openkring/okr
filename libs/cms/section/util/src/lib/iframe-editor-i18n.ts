import type { Signal } from '@angular/core';

import type { ArticleEditorI18n } from './article-editor-i18n';

const PFX = '@cms/section/feature.';

/**
 * The texts of the iframe editor's canvas and panel heads. Like VIDEO_EDITOR_I18N_KEYS in a file of their own: only the editor needs
 * them. It resolves `{ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...IFRAME_EDITOR_I18N_KEYS }` (as IframeEditorI18n); the
 * iframe panel's own texts (`iframe_link_*`, `iframe_height_*`) are among SECTION_I18N_KEYS, as the read-only form shows the panel too.
 */
export const IFRAME_EDITOR_I18N_KEYS = {
  iframe_editor_panel_section:                  PFX + 'iframe.editor.panel.section',
  iframe_editor_panel_iframe:                   PFX + 'iframe.editor.panel.iframe',
  iframe_editor_panel_back:                     PFX + 'iframe.editor.panel.back',
  iframe_editor_panel_label:                    PFX + 'iframe.editor.panel.label',
  iframe_editor_panel_errors:                   PFX + 'iframe.editor.panel.errors',
  iframe_editor_canvas_hint:                    PFX + 'iframe.editor.canvas.hint',
  iframe_editor_canvas_select:                  PFX + 'iframe.editor.canvas.select',
  iframe_editor_canvas_empty:                   PFX + 'iframe.editor.canvas.empty',
  iframe_editor_canvas_blocked:                 PFX + 'iframe.editor.canvas.blocked',
} satisfies Record<string, string>;

export type IframeEditorI18n = ArticleEditorI18n & { [K in keyof typeof IFRAME_EDITOR_I18N_KEYS]: Signal<string> };

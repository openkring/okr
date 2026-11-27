import type { Signal } from '@angular/core';

import type { ArticleEditorI18n } from './article-editor-i18n';

const PFX = '@cms/section/feature.';

/**
 * The texts of the video editor's canvas and panel heads. Like BUTTON_EDITOR_I18N_KEYS in a file of their own: only the editor needs them.
 * It resolves `{ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...VIDEO_EDITOR_I18N_KEYS }` (as VideoEditorI18n); the video panel's
 * own texts (`video_link_*`, `video_ratio_*`) are among SECTION_I18N_KEYS, as the read-only form shows the panel too.
 */
export const VIDEO_EDITOR_I18N_KEYS = {
  video_editor_panel_section:                   PFX + 'video.editor.panel.section',
  video_editor_panel_video:                     PFX + 'video.editor.panel.video',
  video_editor_panel_back:                      PFX + 'video.editor.panel.back',
  video_editor_panel_label:                     PFX + 'video.editor.panel.label',
  video_editor_panel_errors:                    PFX + 'video.editor.panel.errors',
  video_editor_canvas_hint:                     PFX + 'video.editor.canvas.hint',
  video_editor_canvas_select:                   PFX + 'video.editor.canvas.select',
  video_editor_canvas_empty:                    PFX + 'video.editor.canvas.empty',
} satisfies Record<string, string>;

export type VideoEditorI18n = ArticleEditorI18n & { [K in keyof typeof VIDEO_EDITOR_I18N_KEYS]: Signal<string> };

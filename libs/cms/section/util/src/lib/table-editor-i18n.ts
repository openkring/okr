import type { Signal } from '@angular/core';

import type { ArticleEditorI18n } from './article-editor-i18n';

const PFX = '@cms/section/feature.';

/**
 * The texts of the table editor: canvas, row and column tools, the panels of section and table. Like BUTTON_EDITOR_I18N_KEYS in a
 * file of their own: only the editor needs them. It resolves `{ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...TABLE_EDITOR_I18N_KEYS }`
 * (as TableEditorI18n): title, subtitle, intro, text tools, devices and undo are said as in the article editor.
 */
export const TABLE_EDITOR_I18N_KEYS = {
  table_editor_panel_section:                   PFX + 'table.editor.panel.section',
  table_editor_panel_table:                     PFX + 'table.editor.panel.table',
  table_editor_panel_back:                      PFX + 'table.editor.panel.back',
  table_editor_panel_label:                     PFX + 'table.editor.panel.label',
  table_editor_panel_errors:                    PFX + 'table.editor.panel.errors',
  table_editor_canvas_hint:                     PFX + 'table.editor.canvas.hint',
  table_editor_canvas_select:                   PFX + 'table.editor.canvas.select',
  table_editor_canvas_cellPlaceholder:          PFX + 'table.editor.canvas.cellPlaceholder',
  table_editor_canvas_headerPlaceholder:        PFX + 'table.editor.canvas.headerPlaceholder',
  table_editor_canvas_empty:                    PFX + 'table.editor.canvas.empty',
  table_editor_row_addAbove:                    PFX + 'table.editor.row.addAbove',
  table_editor_row_addBelow:                    PFX + 'table.editor.row.addBelow',
  table_editor_row_moveUp:                      PFX + 'table.editor.row.moveUp',
  table_editor_row_moveDown:                    PFX + 'table.editor.row.moveDown',
  table_editor_row_delete:                      PFX + 'table.editor.row.delete',
  table_editor_row_add:                         PFX + 'table.editor.row.add',
  table_editor_column_addLeft:                  PFX + 'table.editor.column.addLeft',
  table_editor_column_addRight:                 PFX + 'table.editor.column.addRight',
  table_editor_column_delete:                   PFX + 'table.editor.column.delete',
  table_editor_paste_button:                    PFX + 'table.editor.paste.button',
  table_editor_paste_denied:                    PFX + 'table.editor.paste.denied',
  table_editor_look_title:                      PFX + 'table.editor.look.title',
  table_editor_look_lines:                      PFX + 'table.editor.look.lines',
  table_editor_look_plain:                      PFX + 'table.editor.look.plain',
  table_editor_look_colored:                    PFX + 'table.editor.look.colored',
  table_editor_look_own:                        PFX + 'table.editor.look.own',
  table_editor_header_label:                    PFX + 'table.editor.header.label',
  table_editor_title_title:                     PFX + 'table.editor.title.title',
  table_editor_title_above:                     PFX + 'table.editor.title.above',
  table_editor_title_legend:                    PFX + 'table.editor.title.legend',
  table_editor_title_header:                    PFX + 'table.editor.title.header',
  table_editor_title_none:                      PFX + 'table.editor.title.none',
  table_editor_columns_title:                   PFX + 'table.editor.columns.title',
  table_editor_columns_column:                  PFX + 'table.editor.columns.column',
  table_editor_columns_auto:                    PFX + 'table.editor.columns.auto',
  table_editor_columns_narrow:                  PFX + 'table.editor.columns.narrow',
  table_editor_columns_wide:                    PFX + 'table.editor.columns.wide',
  table_editor_columns_own:                     PFX + 'table.editor.columns.own',
  table_editor_columns_alignLeft:               PFX + 'table.editor.columns.alignLeft',
  table_editor_columns_alignCenter:             PFX + 'table.editor.columns.alignCenter',
  table_editor_columns_alignRight:              PFX + 'table.editor.columns.alignRight',
  table_editor_size_title:                      PFX + 'table.editor.size.title',
  table_editor_size_s:                          PFX + 'table.editor.size.s',
  table_editor_size_m:                          PFX + 'table.editor.size.m',
  table_editor_size_l:                          PFX + 'table.editor.size.l',
  table_editor_responsive_title:                PFX + 'table.editor.responsive.title',
  table_editor_responsive_auto:                 PFX + 'table.editor.responsive.auto',
  table_editor_responsive_stack:                PFX + 'table.editor.responsive.stack',
  table_editor_responsive_scroll:               PFX + 'table.editor.responsive.scroll',
  table_editor_responsive_autoHelper:           PFX + 'table.editor.responsive.autoHelper',
  table_editor_responsive_stackHelper:          PFX + 'table.editor.responsive.stackHelper',
  table_editor_responsive_scrollHelper:         PFX + 'table.editor.responsive.scrollHelper',
  table_editor_responsive_breakpoint:           PFX + 'table.editor.responsive.breakpoint',
  table_editor_responsive_mobile:               PFX + 'table.editor.responsive.mobile',
  table_editor_responsive_tablet:               PFX + 'table.editor.responsive.tablet',
  table_editor_custom_title:                    PFX + 'table.editor.custom.title',
  table_editor_custom_helper:                   PFX + 'table.editor.custom.helper',
} satisfies Record<string, string>;

export type TableEditorI18n = ArticleEditorI18n & { [K in keyof typeof TABLE_EDITOR_I18N_KEYS]: Signal<string> };

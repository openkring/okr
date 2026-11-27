import type { Signal } from '@angular/core';

import type { ArticleEditorI18n } from './article-editor-i18n';

const PFX = '@cms/section/feature.';

/**
 * The texts of the map editor: canvas and the panels of section and map. Like HERO_EDITOR_I18N_KEYS in a file of their own: only the
 * editor needs them. It resolves `{ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...MAP_EDITOR_I18N_KEYS }` (as MapEditorI18n):
 * title, subtitle, intro, devices and undo are said as in the article editor; the coordinates as in the former map form (`map_*`).
 */
export const MAP_EDITOR_I18N_KEYS = {
  map_editor_panel_section:                     PFX + 'map.editor.panel.section',
  map_editor_panel_map:                         PFX + 'map.editor.panel.map',
  map_editor_panel_back:                        PFX + 'map.editor.panel.back',
  map_editor_panel_label:                       PFX + 'map.editor.panel.label',
  map_editor_panel_errors:                      PFX + 'map.editor.panel.errors',
  map_editor_canvas_hint:                       PFX + 'map.editor.canvas.hint',
  map_editor_canvas_map:                        PFX + 'map.editor.canvas.map',
  map_editor_advanced_show:                     PFX + 'map.editor.advanced.show',
  map_editor_advanced_hide:                     PFX + 'map.editor.advanced.hide',
  map_editor_start_title:                       PFX + 'map.editor.start.title',
  map_editor_start_tenant:                      PFX + 'map.editor.start.tenant',
  map_editor_start_tenant_helper:               PFX + 'map.editor.start.tenantHelper',
  map_editor_start_place:                       PFX + 'map.editor.start.place',
  map_editor_start_place_helper:                PFX + 'map.editor.start.placeHelper',
  map_editor_start_view:                        PFX + 'map.editor.start.view',
  map_editor_start_view_helper:                 PFX + 'map.editor.start.viewHelper',
  map_editor_search:                            PFX + 'map.editor.search',
  map_editor_search_empty:                      PFX + 'map.editor.searchEmpty',
  map_editor_zoom_title:                        PFX + 'map.editor.zoom.title',
  map_editor_zoom_country:                      PFX + 'map.editor.zoom.country',
  map_editor_zoom_region:                       PFX + 'map.editor.zoom.region',
  map_editor_zoom_city:                         PFX + 'map.editor.zoom.city',
  map_editor_zoom_quarter:                      PFX + 'map.editor.zoom.quarter',
  map_editor_zoom_street:                       PFX + 'map.editor.zoom.street',
  map_editor_zoom_own:                          PFX + 'map.editor.zoom.own',
  map_editor_locate_label:                      PFX + 'map.editor.locate.label',
  map_editor_locate_helper:                     PFX + 'map.editor.locate.helper',
  map_editor_pins_title:                        PFX + 'map.editor.pins.title',
  map_editor_pins_helper:                       PFX + 'map.editor.pins.helper',
  map_editor_pins_empty:                        PFX + 'map.editor.pins.empty',
  map_editor_pins_add:                          PFX + 'map.editor.pins.add',
  map_editor_pins_remove:                       PFX + 'map.editor.pins.remove',
  map_editor_pins_fields:                       PFX + 'map.editor.pins.fields',
  map_editor_pin_name:                          PFX + 'map.editor.pin.name',
  map_editor_pin_address:                       PFX + 'map.editor.pin.address',
  map_editor_pin_what3words:                    PFX + 'map.editor.pin.what3words',
  map_editor_pin_seaLevel:                      PFX + 'map.editor.pin.seaLevel',
  map_editor_pin_notes:                         PFX + 'map.editor.pin.notes',
} satisfies Record<string, string>;

export type MapEditorI18n = ArticleEditorI18n & { [K in keyof typeof MAP_EDITOR_I18N_KEYS]: Signal<string> };

/** the texts readers see on a map: the «Mein Standort» button and why it found nothing */
export const MAP_READER_I18N_KEYS = {
  map_locate:                                   PFX + 'map.reader.locate',
  map_locate_error:                             PFX + 'map.reader.locateError',
} satisfies Record<string, string>;

export type MapReaderI18n = { [K in keyof typeof MAP_READER_I18N_KEYS]: Signal<string> };

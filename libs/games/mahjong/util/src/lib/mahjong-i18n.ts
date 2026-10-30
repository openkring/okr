import { Signal } from '@angular/core';

const PFX = '@games/mahjong/feature.';

export const MAHJONG_I18N_KEYS = {
  title:             PFX + 'title',
  desc:              PFX + 'desc',

  // the settings
  layout_label:      PFX + 'option.layout_label',
  layout_pagoda:     PFX + 'option.layout_pagoda',
  layout_towers:     PFX + 'option.layout_towers',
  layout_pyramid:    PFX + 'option.layout_pyramid',
  dim_locked:        PFX + 'option.dim_locked',

  // buttons
  new_game:          PFX + 'action.new_game',
  undo:              PFX + 'action.undo',
  hint:              PFX + 'action.hint',
  shuffle:           PFX + 'action.shuffle',

  // the status line; those carrying {params} are filled with `fill()`
  status_play:       PFX + 'status.play',
  status_selected:   PFX + 'status.selected',
  status_blocked:    PFX + 'status.blocked',
  status_no_match:   PFX + 'status.no_match',
  status_hint:       PFX + 'status.hint',
  status_stuck:      PFX + 'status.stuck',
  status_shuffled:   PFX + 'status.shuffled',
  status_won:        PFX + 'status.won',
  status_won_best:   PFX + 'status.won_best',
  status_stats:      PFX + 'status.stats',
  status_best:       PFX + 'status.best',

  // tile names, for screen readers and the small caption on flowers and seasons
  tile_dot:          PFX + 'tile.dot',
  tile_bam:          PFX + 'tile.bam',
  tile_char:         PFX + 'tile.char',
  tile_wind_E:       PFX + 'tile.wind_E',
  tile_wind_S:       PFX + 'tile.wind_S',
  tile_wind_W:       PFX + 'tile.wind_W',
  tile_wind_N:       PFX + 'tile.wind_N',
  tile_dragon_R:     PFX + 'tile.dragon_R',
  tile_dragon_G:     PFX + 'tile.dragon_G',
  tile_dragon_W:     PFX + 'tile.dragon_W',
  tile_flower:       PFX + 'tile.flower',
  tile_season:       PFX + 'tile.season',
  tile_blocked:      PFX + 'tile.blocked',
  flower_1:          PFX + 'tile.flower_1',
  flower_2:          PFX + 'tile.flower_2',
  flower_3:          PFX + 'tile.flower_3',
  flower_4:          PFX + 'tile.flower_4',
  season_1:          PFX + 'tile.season_1',
  season_2:          PFX + 'tile.season_2',
  season_3:          PFX + 'tile.season_3',
  season_4:          PFX + 'tile.season_4',
} satisfies Record<string, string>;

export type MahjongI18n = { [K in keyof typeof MAHJONG_I18N_KEYS]: Signal<string> };

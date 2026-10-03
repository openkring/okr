import { Signal } from '@angular/core';

const PFX = '@games/klondike/feature.';

export const KLONDIKE_I18N_KEYS = {
  title:           PFX + 'title',
  desc:            PFX + 'desc',

  // the draw-rule select
  draw_label:      PFX + 'option.draw_label',
  draw_one:        PFX + 'option.draw_one',
  draw_three:      PFX + 'option.draw_three',

  // buttons
  undo:            PFX + 'action.undo',
  new_game:        PFX + 'action.new_game',
  auto_finish:     PFX + 'action.auto_finish',

  // screen-reader labels of the piles; those carrying {params} are filled with `fill()`
  stock:           PFX + 'pile.stock',
  stock_empty:     PFX + 'pile.stock_empty',
  waste:           PFX + 'pile.waste',
  foundation:      PFX + 'pile.foundation',
  column_empty:    PFX + 'pile.column_empty',

  // cards: comma lists, indexed by rank − 1 and by suit in the order S, H, D, C
  card_label:      PFX + 'card.label',
  card_hidden:     PFX + 'card.hidden',
  ranks_short:     PFX + 'card.ranks_short',
  ranks_long:      PFX + 'card.ranks_long',
  suits:           PFX + 'card.suits',

  // the status lines
  status_play:      PFX + 'status.play',
  status_selected:  PFX + 'status.selected',
  status_draw_next: PFX + 'status.draw_next',
  status_stats:     PFX + 'status.stats',
  status_best:      PFX + 'status.best',
  status_won:       PFX + 'status.won',
  status_won_best:  PFX + 'status.won_best',
} satisfies Record<string, string>;

export type KlondikeI18n = { [K in keyof typeof KLONDIKE_I18N_KEYS]: Signal<string> };

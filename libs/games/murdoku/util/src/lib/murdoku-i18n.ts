import { Signal } from '@angular/core';

const PFX = '@games/murdoku/feature.';

export const MURDOKU_I18N_KEYS = {
  title:              PFX + 'title',
  desc:               PFX + 'desc',

  // the difficulty select
  difficulty_label:   PFX + 'option.difficulty_label',
  difficulty_easy:    PFX + 'option.difficulty_easy',
  difficulty_medium:  PFX + 'option.difficulty_medium',
  difficulty_hard:    PFX + 'option.difficulty_hard',

  // buttons
  hint:               PFX + 'action.hint',
  mark:               PFX + 'action.mark',
  clear:              PFX + 'action.clear',
  give_up:            PFX + 'action.give_up',
  give_up_confirm:    PFX + 'action.give_up_confirm',
  new_game:           PFX + 'action.new_game',
  next_case:          PFX + 'action.next_case',

  // the dossier
  role_victim:        PFX + 'role.victim',
  role_suspect:       PFX + 'role.suspect',
  role_killer:        PFX + 'role.killer',
  statements:         PFX + 'dossier.statements',
  stats:              PFX + 'dossier.stats',
  stats_best:         PFX + 'dossier.stats_best',

  // rooms
  room_kitchen:       PFX + 'room.kitchen',
  room_library:       PFX + 'room.library',
  room_greenhouse:    PFX + 'room.greenhouse',
  room_workshop:      PFX + 'room.workshop',
  room_music:         PFX + 'room.music',
  room_pantry:        PFX + 'room.pantry',
  room_sunroom:       PFX + 'room.sunroom',
  room_bedroom:       PFX + 'room.bedroom',
  room_office:        PFX + 'room.office',
  room_laundry:       PFX + 'room.laundry',
  room_gallery:       PFX + 'room.gallery',
  room_cellar:        PFX + 'room.cellar',
  room_studio:        PFX + 'room.studio',
  room_chapel:        PFX + 'room.chapel',
  room_salon:         PFX + 'room.salon',
  room_nursery:       PFX + 'room.nursery',

  // furniture, as named in the legend
  furniture_chair:    PFX + 'furniture.chair',
  furniture_rug:      PFX + 'furniture.rug',
  furniture_bed:      PFX + 'furniture.bed',
  furniture_table:    PFX + 'furniture.table',
  furniture_plant:    PFX + 'furniture.plant',
  furniture_shelf:    PFX + 'furniture.shelf',
  legend_rooms:       PFX + 'legend.rooms',
  legend_furniture:   PFX + 'legend.furniture',
  legend_blocked:     PFX + 'legend.blocked',

  // statements; those carrying {params} are filled with `fill()`
  clue_room:          PFX + 'clue.room',
  clue_notRoom:       PFX + 'clue.not_room',
  on_chair:           PFX + 'clue.on_chair',
  on_rug:             PFX + 'clue.on_rug',
  on_bed:             PFX + 'clue.on_bed',
  beside_chair:       PFX + 'clue.beside_chair',
  beside_rug:         PFX + 'clue.beside_rug',
  beside_bed:         PFX + 'clue.beside_bed',
  beside_table:       PFX + 'clue.beside_table',
  beside_plant:       PFX + 'clue.beside_plant',
  beside_shelf:       PFX + 'clue.beside_shelf',
  clue_bare:          PFX + 'clue.bare',
  clue_edge:          PFX + 'clue.edge',
  clue_inner:         PFX + 'clue.inner',
  clue_row:           PFX + 'clue.row',
  clue_col:           PFX + 'clue.col',
  clue_alone:         PFX + 'clue.alone',
  clue_company:       PFX + 'clue.company',
  clue_north:         PFX + 'clue.north',
  clue_west:          PFX + 'clue.west',

  // the accusation
  accuse_title:       PFX + 'accuse.title',
  accuse_text:        PFX + 'accuse.text',
  closed_title:       PFX + 'accuse.closed_title',
  closed_text:        PFX + 'accuse.closed_text',
  revealed_title:     PFX + 'accuse.revealed_title',

  // screen-reader labels
  cell_label:         PFX + 'cell.label',
  cell_marked:        PFX + 'cell.marked',
  person_label:       PFX + 'cell.person',
  compass:            PFX + 'cell.compass',

  // the status line
  status_pick:        PFX + 'status.pick',
  status_placing:     PFX + 'status.placing',
  status_marking:     PFX + 'status.marking',
  status_broken:      PFX + 'status.broken',
  status_pick_first:  PFX + 'status.pick_first',
  blocked_table:      PFX + 'status.blocked_table',
  blocked_plant:      PFX + 'status.blocked_plant',
  blocked_shelf:      PFX + 'status.blocked_shelf',
  status_locked:      PFX + 'status.locked',
  status_hint:        PFX + 'status.hint',
  status_accuse:      PFX + 'status.accuse',
  status_alibi:       PFX + 'status.alibi',
  status_solved:      PFX + 'status.solved',
  status_solved_hints: PFX + 'status.solved_hints',
  status_revealed:    PFX + 'status.revealed',

  // how to play
  guide_title:        PFX + 'guide.title',
  guide_goal:         PFX + 'guide.goal',
  guide_rules:        PFX + 'guide.rules',
  guide_rule_rows:    PFX + 'guide.rule_rows',
  guide_rule_furniture: PFX + 'guide.rule_furniture',
  guide_rule_clues:   PFX + 'guide.rule_clues',
  guide_rule_killer:  PFX + 'guide.rule_killer',
  guide_controls:     PFX + 'guide.controls',
  guide_place:        PFX + 'guide.place',
  guide_mark:         PFX + 'guide.mark',
  guide_hint:         PFX + 'guide.hint',
  guide_finish:       PFX + 'guide.finish',

  // solving tips
  tips_title:         PFX + 'tips.title',
  tip_start:          PFX + 'tips.start',
  tip_blocked:        PFX + 'tips.blocked',
  tip_lines:          PFX + 'tips.lines',
  tip_last:           PFX + 'tips.last',
  tip_alone:          PFX + 'tips.alone',
  tip_victim:         PFX + 'tips.victim',
  tip_compare:        PFX + 'tips.compare',
  tip_negative:       PFX + 'tips.negative',
  tip_assume:         PFX + 'tips.assume',
} satisfies Record<string, string>;

export type MurdokuI18n = { [K in keyof typeof MURDOKU_I18N_KEYS]: Signal<string> };

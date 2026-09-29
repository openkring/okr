import { Signal } from '@angular/core';

const PFX = '@games/crossword/feature.';

/** Validation messages are filed by the Vest suite and resolved by `okr-error-note`. */
export const CROSSWORD_I18N_KEYS = {
  title:              PFX + 'title',

  // admin list + modal
  list_title:         PFX + 'list.title',
  list_empty:         PFX + 'list.empty',
  generate:           PFX + 'action.generate',
  reroll:             PFX + 'action.reroll',
  publish:            PFX + 'action.publish',
  paste_label:        PFX + 'form.paste_label',
  paste_hint:         PFX + 'form.paste_hint',
  form_title:         PFX + 'form.title',
  form_description:   PFX + 'form.description',
  form_language:      PFX + 'form.language',
  form_answer:        PFX + 'form.answer',
  form_clue:          PFX + 'form.clue',

  // generator feedback; {params} are filled with fill()
  placed_count:       PFX + 'status.placed_count',
  grid_stale:         PFX + 'status.grid_stale',
  no_grid:            PFX + 'status.no_grid',

  // play
  across:             PFX + 'play.across',
  down:               PFX + 'play.down',
  check:              PFX + 'play.check',
  reveal_letter:      PFX + 'play.reveal_letter',
  reveal_word:        PFX + 'play.reveal_word',
  restart:            PFX + 'play.restart',
  time_label:         PFX + 'play.time_label',
  solved:             PFX + 'play.solved',
  solved_time:        PFX + 'play.solved_time',

  // service confirmations
  create_conf:        PFX + 'create.conf',
  create_error:       PFX + 'create.error',
  update_conf:        PFX + 'update.conf',
  update_error:       PFX + 'update.error',
  delete_conf:        PFX + 'delete.conf',
  delete_error:       PFX + 'delete.error',

  // validation — same PFX + 'error.<name>' shape as the other keys, filed by crosswordTopicSuite.
  // title/description now go through the shared stringValidations() helper (generic
  // validation.required/tooLong copy, same as hearing-quiz), so only the checks that helper
  // cannot express (clue length, entry-count aggregates) keep a feature-scoped message here.
  error_clue_too_long:        PFX + 'error.clue_too_long',
  error_too_few_entries:      PFX + 'error.too_few_entries',
  error_entries_rejected:     PFX + 'error.entries_rejected',

  // admin list/modal chrome (Task 8) — generic action/header labels the original Task 4 key
  // set did not include (list + edit modal need them for the standard header/change-confirmation/
  // ActionSheet apparatus). `as_title`/`cancel` reuse the existing shared global keys every other
  // domain aliases the same way; the rest are feature-scoped and need real translations.
  as_title:                  '@actionsheet.title',
  cancel:                    '@cancel',
  edit:                      PFX + 'action.edit',
  delete:                    PFX + 'action.delete',
  play:                      PFX + 'action.play',
  create_label:              PFX + 'form.create_label',
  edit_label:                PFX + 'form.edit_label',
  view_label:                PFX + 'form.view_label',
  changeConfirmation_ok:     PFX + 'form.changeConfirmation_ok',
  changeConfirmation_cancel: PFX + 'form.changeConfirmation_cancel',
  entries_label:             PFX + 'form.entries_label',
  entry_add:                 PFX + 'form.entry_add',
  entry_remove:              PFX + 'form.entry_remove',
  paste_apply:               PFX + 'form.paste_apply',
  unplaced_label:            PFX + 'status.unplaced_label',
} satisfies Record<string, string>;

export type CrosswordI18n = { [K in keyof typeof CROSSWORD_I18N_KEYS]: Signal<string> };

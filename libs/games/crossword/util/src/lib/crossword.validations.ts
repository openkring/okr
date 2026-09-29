import { create, enforce, only, test } from 'vest';
import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { CrosswordTopicModel } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { CROSSWORD_I18N_KEYS } from './crossword-i18n';
import { normalizeEntries } from './crossword.normalize';

/** Typing limits of the free-text fields; the form binds the same constants. */
export const MAX_TITLE_LENGTH = 100;
export const MAX_CLUE_LENGTH = 200;
/** Fewest usable (normalised, non-duplicate, non-empty-clue) entries a topic can publish with. */
export const MIN_ENTRIES = 5;

/**
 * Topic: a title, an optional description, and at least `MIN_ENTRIES` usable answer/clue pairs.
 * "Usable" is decided by `normalizeEntries` from Task 2 — the same function the generator itself
 * runs, so a topic that passes validation is guaranteed generatable.
 */
export const crosswordTopicSuite = create((model: CrosswordTopicModel, field?: string) => {
  only(field);

  stringValidations('title', model.title, MAX_TITLE_LENGTH, 0, true);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);

  test('clue', CROSSWORD_I18N_KEYS.error_clue_too_long, () => {
    enforce(model.entries.every(entry => entry.clue.length <= MAX_CLUE_LENGTH)).isTruthy();
  });

  test('entries', CROSSWORD_I18N_KEYS.error_too_few_entries, () => {
    const { usable } = normalizeEntries(model.entries);
    enforce(usable.length).gte(MIN_ENTRIES);
  });

  test('entries', CROSSWORD_I18N_KEYS.error_entries_rejected, () => {
    const { rejected } = normalizeEntries(model.entries);
    enforce(rejected.length).equals(0);
  });
});

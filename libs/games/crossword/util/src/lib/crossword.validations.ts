import { create, enforce, only, test } from 'vest';
import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { CrosswordTopicModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';
import { CROSSWORD_I18N_KEYS } from './crossword-i18n';

/** Typing limits of the free-text fields; the form binds the same constants. */
export const MAX_TITLE_LENGTH = 100;
export const MAX_CLUE_LENGTH = 200;
/**
 * Fewest usable (normalised, non-duplicate, non-empty-clue) entries a topic can PUBLISH with —
 * a publish-time quality gate, not a save-time one. Read directly by the edit modal's
 * `canPublish`/`canGenerate` (via `normalizeEntries`), not by `crosswordTopicSuite`: see that
 * suite's doc comment for why.
 */
export const MIN_ENTRIES = 5;

/**
 * Topic: a title, an optional description, and no over-long clue. Deliberately does NOT enforce
 * `MIN_ENTRIES` or reject duplicate/too-short/empty-clue entries (`normalizeEntries`'s job) — a
 * draft with three entries, or one `addEntry()` away from a duplicate, must stay SAVEABLE.
 * `MIN_ENTRIES`'s own docstring calls it the floor to PUBLISH with, and the edit modal's
 * `canPublish` is where that floor is actually enforced (Task 8 review round 1, IMPORTANT 3) —
 * folding it into this suite as well made every such draft unsaveable the moment `addEntry()`
 * appended its first (necessarily still-blank, therefore rejected) row.
 *
 * The clue-length check is filed under `'entries'`, a real `CrosswordTopicModel` property — NOT
 * `'clue'`, which is not a model field at all. `'clue'` was the Task 8 review round-1 bug:
 * `validateVestTree`'s `resolveFieldTree` cannot walk an unresolvable key onto the Angular
 * `FieldTree`, so it silently dropped the error (a `console.warn` under `ngDevMode`, nothing
 * thrown) and an over-long clue never blocked the change-confirmation Save banner — the suite
 * reported invalid, but `form.valid()` still read true. See `crossword.validations.spec.ts` and
 * `libs/shared/util-angular/src/lib/vest-bridge.spec.ts` for the same failure mode proven in
 * general.
 */
export const crosswordTopicSuite = create((model: CrosswordTopicModel, tenants = '', tags = '', field?: string) => {
  only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('title', model.title, MAX_TITLE_LENGTH, 0, true);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);

  test('entries', CROSSWORD_I18N_KEYS.error_clue_too_long, () => {
    enforce(model.entries.every(entry => entry.clue.length <= MAX_CLUE_LENGTH)).isTruthy();
  });
});

import { provideZonelessChangeDetection, runInInjectionContext, signal, type ApplicationRef } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { form } from '@angular/forms/signals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrosswordTopicModel } from '@okr/shared-models';

// `@okr/shared-util-angular` is a barrel: importing `validateVestTree` from it also loads every
// sibling file the barrel re-exports, several of which import `@ionic/angular`(`/standalone`) —
// under Vitest that trips a bare-directory-import ESM resolution error in `@ionic/core/components`
// (same class of problem `vitest.shared.ts` already documents for matrix-js-sdk). Other util-lib
// specs that hit this (menu.util.spec.ts, expense.validations.spec.ts, membership.util.spec.ts)
// mock the WHOLE barrel away, because "a pure util test must not load Angular + Ionic" — but that
// would also mock away the very `validateVestTree` this test exists to exercise for real. Stubbing
// only the two Ionic entry points lets the rest of the real barrel — including the real,
// unmodified `vest-bridge.ts` — load and run normally.
vi.mock('@ionic/angular', () => ({}));
vi.mock('@ionic/angular/standalone', () => ({}));

import { validateVestTree } from '@okr/shared-util-angular';
import { crosswordTopicSuite, MAX_CLUE_LENGTH } from './crossword.validations';

function topic(overrides: Partial<CrosswordTopicModel> = {}): CrosswordTopicModel {
  return Object.assign(new CrosswordTopicModel('scs'), {
    title: 'Seeclub Geschichte',
    entries: [
      { answer: 'Ruder', clue: 'Damit bewegt man das Boot' },
      { answer: 'Regatta', clue: 'Wettkampf' },
      { answer: 'Steg', clue: 'Zugang zum Wasser' },
      { answer: 'Riemen', clue: 'Einseitiges Ruder' },
      { answer: 'Achter', clue: 'Boot mit acht Ruderern' },
    ],
  }, overrides);
}

describe('crosswordTopicSuite', () => {
  it('accepts a well-formed topic', () => {
    expect(crosswordTopicSuite(topic()).isValid()).toBe(true);
  });

  it('requires a title', () => {
    expect(crosswordTopicSuite(topic({ title: '' })).hasErrors('title')).toBe(true);
  });

  // Task 8 review round 1, IMPORTANT 3: the entries-count and duplicate/too-short/empty-clue
  // ("entries-rejected") rules moved OUT of this suite and into the edit modal's publish gate
  // (`CrosswordTopicEditModal.canPublish`, via `normalizeEntries` directly) — `MIN_ENTRIES`'s own
  // docstring calls it the floor to PUBLISH with, so a draft with too few entries, or one
  // `addEntry()` away from a duplicate, must stay SAVEABLE; only publishing it is refused.
  // `normalizeEntries` itself (usable/rejected counts) is already exercised end to end in
  // crossword.normalize.spec.ts — these two tests now prove the suite does NOT re-block them.
  it('does not block saving a draft with too few entries (a publish-time check now)', () => {
    expect(crosswordTopicSuite(topic({ entries: [{ answer: 'Ruder', clue: 'x' }] })).hasErrors('entries')).toBe(false);
  });

  it('does not block saving a draft whose answers collide after normalisation (also a publish-time check now)', () => {
    const entries = [...topic().entries, { answer: 'Müller', clue: 'a' }, { answer: 'Mueller', clue: 'b' }];
    expect(crosswordTopicSuite(topic({ entries })).hasErrors('entries')).toBe(false);
  });

  // Correction (C): a later task binds the entry-clue input's [maxLength] to MAX_CLUE_LENGTH;
  // pnpm check-forms fails if the template cap is not the very cap the suite enforces.
  //
  // Task 8 review round 1, IMPORTANT 1: this rule is now filed under 'entries' — a real
  // CrosswordTopicModel property — not 'clue', which is not a model field at all and could never
  // resolve onto the Angular FieldTree (see the suite's doc comment, and the validateVestTree
  // round-trip proof below).
  it('rejects a clue longer than MAX_CLUE_LENGTH', () => {
    const entries = topic().entries.map((entry, index) =>
      index === 0 ? { ...entry, clue: 'x'.repeat(MAX_CLUE_LENGTH + 1) } : entry);
    const result = crosswordTopicSuite(topic({ entries }));
    expect(result.isValid()).toBe(false);
    expect(result.hasErrors('entries')).toBe(true);
  });
});

/**
 * Task 8 review round 1, IMPORTANT 1 (CONFIRMED BY EXECUTION): before the field-key fix above,
 * this suite reported `isValid() === false` for an over-long clue, but `validateVestTree`'s
 * `resolveFieldTree` could not walk the vest key `'clue'` onto any node of the Angular `FieldTree`
 * — 'clue' is not a `CrosswordTopicModel` property — so the error was silently dropped and the
 * bridged Angular Signal Forms `form()` reported `valid() === true`. The banner appeared and the
 * topic saved with a clue past its own `[maxLength]`. This spec proves the fix through the REAL
 * `@angular/forms/signals` `form()`, the same way `libs/shared/util-angular/src/lib/vest-bridge.spec.ts`
 * proves `resolveFieldTree`'s array-path case — not a hand-rolled fake of `FieldTree`, which would
 * prove nothing about the framework's actual behaviour.
 */
describe('crosswordTopicSuite — through validateVestTree (Task 8 review round 1 regression)', () => {
  let appRef: ApplicationRef | undefined;

  afterEach(() => {
    appRef?.destroy();
    appRef = undefined;
  });

  it('reports form.valid() === false for an over-long clue, not silently true', async () => {
    appRef = await createApplication({ providers: [provideZonelessChangeDetection()] });

    const entries = topic().entries.map((entry, index) =>
      index === 0 ? { ...entry, clue: 'x'.repeat(MAX_CLUE_LENGTH + 1) } : entry);
    const model = signal<CrosswordTopicModel>(topic({ entries }));

    const tree = runInInjectionContext(appRef.injector, () =>
      form(model, (path) => validateVestTree(path, crosswordTopicSuite as any)),
    );
    appRef.tick();

    // control probe: the suite itself already reported invalid before this fix too — the bug was
    // entirely in resolveFieldTree silently dropping the unresolvable 'clue' key downstream.
    expect(crosswordTopicSuite(model()).isValid()).toBe(false);
    expect(crosswordTopicSuite(model()).hasErrors('entries')).toBe(true);

    // the actual regression this spec exists to catch: before the fix, this was `true`.
    expect(tree().valid()).toBe(false);
    expect(tree.entries().valid()).toBe(false);
  });
});

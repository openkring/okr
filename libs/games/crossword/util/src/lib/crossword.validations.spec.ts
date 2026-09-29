import { describe, expect, it } from 'vitest';
import { CrosswordTopicModel } from '@okr/shared-models';
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

  it('requires at least five entries', () => {
    expect(crosswordTopicSuite(topic({ entries: [{ answer: 'Ruder', clue: 'x' }] })).hasErrors('entries')).toBe(true);
  });

  it('rejects a topic whose answers collide after normalisation', () => {
    const entries = [...topic().entries, { answer: 'Müller', clue: 'a' }, { answer: 'Mueller', clue: 'b' }];
    expect(crosswordTopicSuite(topic({ entries })).hasErrors('entries')).toBe(true);
  });

  // Correction (C): a later task binds the entry-clue input's [maxLength] to MAX_CLUE_LENGTH;
  // pnpm check-forms fails if the template cap is not the very cap the suite enforces.
  it('rejects a clue longer than MAX_CLUE_LENGTH', () => {
    const entries = topic().entries.map((entry, index) =>
      index === 0 ? { ...entry, clue: 'x'.repeat(MAX_CLUE_LENGTH + 1) } : entry);
    expect(crosswordTopicSuite(topic({ entries })).hasErrors('clue')).toBe(true);
  });
});

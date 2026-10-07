import { enforce, only, staticSuite, test } from 'vest';

import { stringValidations } from '@okr/shared-util-core';

/** caps of the poll form; the template binds the same constants */
export const POLL_QUESTION_LENGTH = 255;
export const POLL_ANSWER_LENGTH = 100;
/** Matrix (MSC3381) allows 2–20 answers */
export const POLL_MIN_ANSWERS = 2;
export const POLL_MAX_ANSWERS = 20;

/** What the poll form edits — structurally the data-access MatrixPollData, which util may not import. */
export type PollFormData = {
  question: string;
  answers: string[];
  maxSelections?: number;
};

/**
 * Eine Umfrage braucht eine Frage und zwischen zwei und zwanzig Antworten, jede mit Text.
 * Gesperrte Antworten (schon abgestimmt) zaehlen mit — sie stehen vorne in `answers` —, werden
 * aber nicht einzeln geprueft: sie sind nicht editierbar und koennen aus einem anderen Matrix-Client
 * stammen, ein Fehler dort wuerde die Umfrage unspeicherbar machen.
 */
export const pollValidations = staticSuite((data: PollFormData, lockedCount = 0, field?: string) => {
  if (field) only(field);

  stringValidations('question', data.question?.trim(), POLL_QUESTION_LENGTH, 0, true);

  const answers = data.answers ?? [];
  test('answers', '@chat/feature.validation.pollAnswersTooFew', () => {
    enforce(answers.length).greaterThanOrEquals(POLL_MIN_ANSWERS);
  });
  test('answers', '@chat/feature.validation.pollAnswersTooMany', () => {
    enforce(answers.length).lessThanOrEquals(POLL_MAX_ANSWERS);
  });
  answers.forEach((answer, i) => {
    if (i < lockedCount) return;
    stringValidations(`answers[${i}]`, answer?.trim(), POLL_ANSWER_LENGTH, 0, true);
  });
});

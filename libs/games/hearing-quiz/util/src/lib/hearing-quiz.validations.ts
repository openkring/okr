import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { HearingQuizNodeModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

import { HEARING_QUIZ_VALIDATION } from './hearing-quiz-i18n';
import { HQ_MAX_ANSWERS, HQ_MIN_ANSWERS } from './hearing-quiz.util';

/** Typing limits of the free-text fields; the form binds the same constants. */
export const HQ_TITLE_LENGTH = NAME_LENGTH;
export const HQ_QUESTION_LENGTH = LONG_NAME_LENGTH;
export const HQ_ANSWER_LENGTH = NAME_LENGTH;
export const HQ_CAPTION_LENGTH = NAME_LENGTH;
export const HQ_HINT_LENGTH = DESCRIPTION_LENGTH;

/**
 * Folder: a title. Question: title, prompt, a clip, 2–6 distinct non-blank answers and a
 * correct answer that points at one of them. `type` and `parentKey` are selector values: no caps.
 */
export const hearingQuizNodeValidations = staticSuite((model: HearingQuizNodeModel, tenants: string, tags: string) => {
  baseValidations(model, tenants, tags);
  stringValidations('title', model.title, HQ_TITLE_LENGTH, 0, true);
  stringValidations('type', model.type, undefined, 0, true);

  omitWhen(model.type !== 'folder', () => {
    stringValidations('description', model.description, DESCRIPTION_LENGTH);
  });

  omitWhen(model.type !== 'question', () => {
    stringValidations('question', model.question, HQ_QUESTION_LENGTH, 0, true);
    stringValidations('hint', model.hint, HQ_HINT_LENGTH);

    test('audioUrl', HEARING_QUIZ_VALIDATION.audio_missing, () => {
      enforce(model.audioUrl ?? '').isNotBlank();
    });

    const answers = model.answers ?? [];
    test('answers', HEARING_QUIZ_VALIDATION.answers_count, () => {
      enforce(answers.length).greaterThanOrEquals(HQ_MIN_ANSWERS).lessThanOrEquals(HQ_MAX_ANSWERS);
    });
    test('answers', HEARING_QUIZ_VALIDATION.answers_blank, () => {
      enforce(answers.every(a => (a.text ?? '').trim().length > 0)).isTruthy();
    });
    test('answers', HEARING_QUIZ_VALIDATION.answers_unique, () => {
      const texts = answers.map(a => (a.text ?? '').trim().toLowerCase()).filter(t => t.length > 0);
      enforce(new Set(texts).size === texts.length).isTruthy();
    });
    test('answers', 'tooLong', () => {
      enforce(answers.every(a => (a.text ?? '').length <= HQ_ANSWER_LENGTH && (a.caption ?? '').length <= HQ_CAPTION_LENGTH)).isTruthy();
    });
    test('correctAnswer', HEARING_QUIZ_VALIDATION.correct_answer, () => {
      enforce(Number.isInteger(model.correctAnswer) && model.correctAnswer >= 0 && model.correctAnswer < answers.length).isTruthy();
    });
  });

  test('parentKey', HEARING_QUIZ_VALIDATION.parent_invalid, () => {
    enforce(model.parentKey !== model.okey || !model.okey).isTruthy();
  });
});

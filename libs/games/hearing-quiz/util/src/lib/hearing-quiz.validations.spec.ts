import { describe, expect, it } from 'vitest';

import { HearingQuizNodeModel } from '@okr/shared-models';

import { HEARING_QUIZ_VALIDATION } from './hearing-quiz-i18n';
import { newHearingQuizNode } from './hearing-quiz.util';
import { hearingQuizNodeValidations } from './hearing-quiz.validations';

function validQuestion(): HearingQuizNodeModel {
  const q = newHearingQuizNode('test', 'question', 'f1');
  q.title = 'ba oder pa';
  q.question = 'Welche Silbe hörst du?';
  q.audioUrl = 'https://example/ba.mp3';
  q.answers = [{ text: '/ba/', caption: 'Konsonant', imageUrl: '' }, { text: '/pa/', caption: '', imageUrl: '' }];
  q.correctAnswer = 1;
  return q;
}

const run = (m: HearingQuizNodeModel) => hearingQuizNodeValidations(m, 'test', '');

describe('hearingQuizNodeValidations', () => {
  it('accepts a complete question', () => {
    expect(run(validQuestion()).isValid()).toBe(true);
  });

  it('accepts a folder with a title and ignores question fields', () => {
    const f = newHearingQuizNode('test', 'folder');
    f.title = 'Vokale';
    expect(run(f).isValid()).toBe(true);
  });

  it('requires a title', () => {
    const f = newHearingQuizNode('test', 'folder');
    expect(run(f).getErrors('title')).toContain('required');
  });

  it('requires a clip', () => {
    const q = validQuestion();
    q.audioUrl = '';
    expect(run(q).getErrors('audioUrl')).toContain(HEARING_QUIZ_VALIDATION.audio_missing);
  });

  it('requires 2 to 6 answers', () => {
    const q = validQuestion();
    q.answers = q.answers.slice(0, 1);
    q.correctAnswer = 0;
    expect(run(q).getErrors('answers')).toContain(HEARING_QUIZ_VALIDATION.answers_count);
    q.answers = Array.from({ length: 7 }, (_, i) => ({ text: `a${i}`, caption: '', imageUrl: '' }));
    expect(run(q).getErrors('answers')).toContain(HEARING_QUIZ_VALIDATION.answers_count);
  });

  it('rejects blank and duplicate answers', () => {
    const q = validQuestion();
    q.answers[1].text = '  ';
    expect(run(q).getErrors('answers')).toContain(HEARING_QUIZ_VALIDATION.answers_blank);
    q.answers[1].text = '/BA/';
    expect(run(q).getErrors('answers')).toContain(HEARING_QUIZ_VALIDATION.answers_unique);
  });

  it('requires the correct answer to point at an answer', () => {
    const q = validQuestion();
    q.correctAnswer = 2;
    expect(run(q).getErrors('correctAnswer')).toContain(HEARING_QUIZ_VALIDATION.correct_answer);
  });

  it('refuses a node that is its own parent', () => {
    const f = newHearingQuizNode('test', 'folder');
    f.okey = 'x';
    f.parentKey = 'x';
    f.title = 'loop';
    expect(run(f).getErrors('parentKey')).toContain(HEARING_QUIZ_VALIDATION.parent_invalid);
  });
});

import { describe, expect, it } from 'vitest';

import { POLL_ANSWER_LENGTH, POLL_MAX_ANSWERS, POLL_QUESTION_LENGTH, pollValidations } from './poll.validations';

const valid = { question: 'Wann treffen wir uns?', answers: ['Montag', 'Dienstag'], maxSelections: 1 };

describe('pollValidations', () => {
  it('accepts a question with two answers', () => {
    expect(pollValidations(valid).isValid()).toBe(true);
  });

  it('rejects a blank question (whitespace only)', () => {
    expect(pollValidations({ ...valid, question: '   ' }).getErrors('question').length).toBeGreaterThan(0);
  });

  it('rejects a question over the cap', () => {
    expect(pollValidations({ ...valid, question: 'x'.repeat(POLL_QUESTION_LENGTH + 1) }).isValid()).toBe(false);
  });

  it('rejects fewer than two answers', () => {
    expect(pollValidations({ ...valid, answers: ['Montag'] }).getErrors('answers').length).toBeGreaterThan(0);
  });

  it('rejects more than the Matrix maximum of answers', () => {
    const answers = Array.from({ length: POLL_MAX_ANSWERS + 1 }, (_, i) => `Option ${i}`);
    expect(pollValidations({ ...valid, answers }).getErrors('answers').length).toBeGreaterThan(0);
  });

  it('accepts exactly the Matrix maximum of answers', () => {
    const answers = Array.from({ length: POLL_MAX_ANSWERS }, (_, i) => `Option ${i}`);
    expect(pollValidations({ ...valid, answers }).isValid()).toBe(true);
  });

  it('rejects a blank or over-long answer, filed under its array path', () => {
    expect(pollValidations({ ...valid, answers: ['Montag', ' '] }).getErrors('answers[1]').length).toBeGreaterThan(0);
    expect(pollValidations({ ...valid, answers: ['Montag', 'x'.repeat(POLL_ANSWER_LENGTH + 1)] }).getErrors('answers[1]').length).toBeGreaterThan(0);
  });

  it('does not check locked answers one by one, but still counts them', () => {
    const long = 'x'.repeat(POLL_ANSWER_LENGTH + 1);
    expect(pollValidations({ ...valid, answers: [long, 'Dienstag'] }, 1).isValid()).toBe(true);
    expect(pollValidations({ ...valid, answers: [long] }, 1).getErrors('answers').length).toBeGreaterThan(0);
  });
});

import { buildEditedPollAnswers, buildPollContent, canEditPoll, parsePollContent, PollAnswerDef } from './poll.util';

const answers = (...bodies: string[]): PollAnswerDef[] => bodies.map((body, i) => ({ id: String(i + 1), body }));

describe('buildEditedPollAnswers', () => {
  it('renumbers freely while nobody has voted', () => {
    expect(buildEditedPollAnswers(answers('a', 'b', 'c'), ['c', 'x'], false)).toEqual(answers('c', 'x'));
  });

  it('keeps the ids of existing answers once votes exist and appends new ones', () => {
    expect(buildEditedPollAnswers(answers('a', 'b'), ['a', 'b', 'c'], true)).toEqual(answers('a', 'b', 'c'));
  });

  it('never reuses an id, even when the original ids have gaps', () => {
    const original = [{ id: '1', body: 'a' }, { id: '5', body: 'b' }];
    expect(buildEditedPollAnswers(original, ['a', 'b', 'c'], true)).toEqual([...original, { id: '6', body: 'c' }]);
  });

  it('keeps the existing answers when votes exist, whatever the form sends for them', () => {
    expect(buildEditedPollAnswers(answers('a', 'b'), ['z', 'b', 'c'], true)).toEqual(answers('a', 'b', 'c'));
  });
});

describe('canEditPoll', () => {
  const poll = { question: 'Q', answers: answers('a', 'b'), maxSelections: 20 };

  it('allows any change while nobody has voted', () => {
    expect(canEditPoll(poll, { ...poll, answers: answers('x', 'y'), maxSelections: 1 }, false)).toBe(true);
  });

  it('allows single → multiple choice once votes exist', () => {
    const single = { ...poll, maxSelections: 1 };
    expect(canEditPoll(single, poll, true)).toBe(true);
  });

  it('refuses multiple → single choice once votes exist', () => {
    expect(canEditPoll(poll, { ...poll, maxSelections: 1 }, true)).toBe(false);
  });

  it('refuses dropping an answer once votes exist', () => {
    expect(canEditPoll(poll, { ...poll, answers: answers('a') }, true)).toBe(false);
  });

  it('refuses fewer than two answers or an empty question', () => {
    expect(canEditPoll(poll, { ...poll, answers: answers('a') }, false)).toBe(false);
    expect(canEditPoll(poll, { ...poll, question: '  ' }, false)).toBe(false);
  });
});

describe('buildPollContent / parsePollContent', () => {
  it('round-trips question, answers and max selections', () => {
    const content = buildPollContent('Wann?', answers('Mo', 'Di'), 20);
    expect(content.body).toBe('Wann?\n1. Mo\n2. Di');
    expect(parsePollContent(content)).toEqual({ question: 'Wann?', answers: answers('Mo', 'Di'), maxSelections: 20 });
  });

  it('defaults to single choice and tolerates a missing poll block', () => {
    expect(parsePollContent({ body: 'x' })).toEqual({ question: 'x', answers: [], maxSelections: 1 });
  });
});

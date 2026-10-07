/**
 * MSC3381 poll content helpers, shared by sending, editing and rendering a poll.
 *
 * Votes reference answers by id, never by text or position. Everything here exists to keep
 * that reference stable when the author edits a poll that has already been voted on.
 */

export const POLL_START_EVENT = 'org.matrix.msc3381.poll.start';
const POLL_KEY = 'org.matrix.msc3381.poll';
const ANSWER_KEY = 'org.matrix.msc3381.poll.answer';

export interface PollAnswerDef {
  id: string;
  body: string;
}

export interface PollDef {
  question: string;
  answers: PollAnswerDef[];
  maxSelections: number;
}

/** Build the content of a poll.start event (also used as `m.new_content` of an edit). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPollContent(question: string, answers: PollAnswerDef[], maxSelections: number): Record<string, any> {
  return {
    [POLL_KEY]: {
      question: { msgtype: 'm.text', body: question },
      kind: 'org.matrix.msc3381.poll.disclosed',
      max_selections: maxSelections,
      answers: answers.map(a => ({ id: a.id, [ANSWER_KEY]: { msgtype: 'm.text', body: a.body } })),
    },
    body: `${question}\n${answers.map((a, i) => `${i + 1}. ${a.body}`).join('\n')}`,
  };
}

/** Read question, answers and max selections from a poll.start content (original or edited). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePollContent(content: Record<string, any> | undefined): PollDef {
  const poll = content?.[POLL_KEY];
  const rawAnswers = Array.isArray(poll?.answers) ? poll.answers : [];
  return {
    question: poll?.question?.body ?? content?.body ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    answers: rawAnswers.map((a: any) => ({ id: String(a.id), body: a[ANSWER_KEY]?.body ?? String(a.id) })),
    maxSelections: poll?.max_selections ?? 1,
  };
}

/**
 * Turn the answer texts of the edit form into answer definitions.
 *
 * Without votes the ids are simply renumbered. With votes, the existing answers are kept
 * verbatim (the form shows them read-only) and only the texts beyond them are appended, each
 * with a fresh id above the highest one ever used — so no vote can end up on another answer.
 */
export function buildEditedPollAnswers(original: PollAnswerDef[], answerTexts: string[], hasVotes: boolean): PollAnswerDef[] {
  if (!hasVotes) return answerTexts.map((body, i) => ({ id: String(i + 1), body }));
  let nextId = original.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0);
  const added = answerTexts.slice(original.length).map(body => ({ id: String(++nextId), body }));
  return [...original, ...added];
}

/**
 * May the author replace `original` with `edited`? Once votes exist, no answer may disappear
 * and a multiple-choice poll may not become single choice (existing ballots would not fit).
 */
export function canEditPoll(original: PollDef, edited: PollDef, hasVotes: boolean): boolean {
  if (edited.question.trim().length === 0 || edited.answers.length < 2) return false;
  if (!hasVotes) return true;
  if (original.maxSelections > 1 && edited.maxSelections <= 1) return false;
  const editedIds = new Set(edited.answers.map(a => a.id));
  return original.answers.every(a => editedIds.has(a.id));
}

import { describe, expect, it } from 'vitest';
import { allowedAnswers, answerFunctionUrl, isAnswerChoice, respondUrl, signAnswer, signRespond, verifyAnswer } from './answer-link';

const SECRET = 'test-secret';

describe('signAnswer / verifyAnswer', () => {
  const sig = signAnswer('inv1', 'p1', 'accept', SECRET);

  it('accepts its own signature', () => expect(verifyAnswer('inv1', 'p1', 'accept', sig, SECRET)).toBe(true));
  it('rejects a swapped answer', () => expect(verifyAnswer('inv1', 'p1', 'decline', sig, SECRET)).toBe(false));
  it('rejects another invitation', () => expect(verifyAnswer('inv2', 'p1', 'accept', sig, SECRET)).toBe(false));
  it('rejects another invitee', () => expect(verifyAnswer('inv1', 'p2', 'accept', sig, SECRET)).toBe(false));
  it('rejects another secret', () => expect(verifyAnswer('inv1', 'p1', 'accept', sig, 'other')).toBe(false));
  it('rejects a tampered signature', () => expect(verifyAnswer('inv1', 'p1', 'accept', sig.slice(0, -2) + 'xx', SECRET)).toBe(false));
  it('rejects an empty or garbage signature', () => {
    expect(verifyAnswer('inv1', 'p1', 'accept', '', SECRET)).toBe(false);
    expect(verifyAnswer('inv1', 'p1', 'accept', '%%%', SECRET)).toBe(false);
  });
  it('rejects everything when the secret is empty', () => {
    expect(verifyAnswer('inv1', 'p1', 'accept', signAnswer('inv1', 'p1', 'accept', ''), '')).toBe(false);
  });
  it('is url-safe', () => expect(sig).toMatch(/^[A-Za-z0-9_-]+$/));
});

describe('isAnswerChoice', () => {
  it('knows the two answers only', () => {
    expect(isAnswerChoice('accept')).toBe(true);
    expect(isAnswerChoice('decline')).toBe(true);
    expect(isAnswerChoice('maybe')).toBe(false);
    expect(isAnswerChoice(undefined)).toBe(false);
  });
});

describe('allowedAnswers', () => {
  const respond = signRespond('inv1', 'p1', SECRET);

  it('allows both answers for a respond signature', () => expect(allowedAnswers('inv1', 'p1', respond, SECRET)).toEqual(['accept', 'decline']));
  it('ignores the a parameter on a respond signature', () => expect(allowedAnswers('inv1', 'p1', respond, SECRET, 'decline')).toEqual(['accept', 'decline']));
  it('rejects a respond signature for another invitation, invitee or secret', () => {
    expect(allowedAnswers('inv2', 'p1', respond, SECRET)).toEqual([]);
    expect(allowedAnswers('inv1', 'p2', respond, SECRET)).toEqual([]);
    expect(allowedAnswers('inv1', 'p1', respond, 'other')).toEqual([]);
  });
  it('allows only the signed answer of a legacy link', () => {
    const legacy = signAnswer('inv1', 'p1', 'decline', SECRET);
    expect(allowedAnswers('inv1', 'p1', legacy, SECRET, 'decline')).toEqual(['decline']);
    expect(allowedAnswers('inv1', 'p1', legacy, SECRET, 'accept')).toEqual([]);
    expect(allowedAnswers('inv1', 'p1', legacy, SECRET)).toEqual([]);
  });
  it('rejects garbage and an empty secret', () => {
    expect(allowedAnswers('inv1', 'p1', '%%%', SECRET)).toEqual([]);
    expect(allowedAnswers('inv1', 'p1', signRespond('inv1', 'p1', ''), '')).toEqual([]);
  });
});

describe('respondUrl', () => {
  it('builds the function url without an answer', () => {
    const url = new URL(respondUrl(answerFunctionUrl('bkaiser-org'), 'inv 1', 'p1', SECRET));
    expect(url.origin).toBe('https://europe-west6-bkaiser-org.cloudfunctions.net');
    expect(url.pathname).toBe('/invitationAnswer');
    expect(url.searchParams.get('i')).toBe('inv 1');
    expect(url.searchParams.has('a')).toBe(false);
    expect(allowedAnswers('inv 1', 'p1', url.searchParams.get('s') ?? '', SECRET)).toEqual(['accept', 'decline']);
  });
});

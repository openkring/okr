import { describe, expect, it } from 'vitest';
import { answerFunctionUrl, answerUrl, isAnswerChoice, signAnswer, verifyAnswer } from './answer-link';

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

describe('answerUrl', () => {
  it('builds the function url with encoded parameters', () => {
    const url = new URL(answerUrl(answerFunctionUrl('bkaiser-org'), 'inv 1', 'p1', 'decline', SECRET));
    expect(url.origin).toBe('https://europe-west6-bkaiser-org.cloudfunctions.net');
    expect(url.pathname).toBe('/invitationAnswer');
    expect(url.searchParams.get('i')).toBe('inv 1');
    expect(url.searchParams.get('a')).toBe('decline');
    expect(verifyAnswer('inv 1', 'p1', 'decline', url.searchParams.get('s') ?? '', SECRET)).toBe(true);
  });
});

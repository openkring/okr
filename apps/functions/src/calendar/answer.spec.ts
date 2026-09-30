import { describe, expect, it } from 'vitest';
import { REFUSAL_TEXT, decideAnswer, linkRefusal, responseCommentKey } from './answer';

const inv = { tenants: ['scs'], inviteeKey: 'p', caleventKey: 'e', state: 'pending' };
const event = { name: 'test2', startDate: '20261001', startTime: '11:00' };

describe('decideAnswer', () => {
  it('allows a pending invitation to a future event', () => expect(decideAnswer(inv, event, '20260930')).toBeUndefined());
  it('allows changing an earlier answer', () => {
    expect(decideAnswer({ ...inv, state: 'accepted' }, event, '20260930')).toBeUndefined();
    expect(decideAnswer({ ...inv, state: 'declined' }, event, '20260930')).toBeUndefined();
  });
  it('allows answering on the day itself', () => expect(decideAnswer(inv, event, '20261001')).toBeUndefined());
  it('refuses a deleted or archived invitation', () => {
    expect(decideAnswer(undefined, event, '20260930')).toBe('gone');
    expect(decideAnswer({ ...inv, isArchived: true }, event, '20260930')).toBe('gone');
  });
  it('refuses a locked invitation', () => expect(decideAnswer({ ...inv, isLocked: true }, event, '20260930')).toBe('locked'));
  it('refuses a deleted or archived event', () => {
    expect(decideAnswer(inv, undefined, '20260930')).toBe('eventGone');
    expect(decideAnswer(inv, { ...event, isArchived: true }, '20260930')).toBe('eventGone');
  });
  it('refuses a past event', () => expect(decideAnswer(inv, event, '20261002')).toBe('past'));
});

describe('linkRefusal', () => {
  it('accepts a valid link to an existing invitation', () => expect(linkRefusal(true, true, true)).toBeUndefined());
  it('reports a well-formed link to a missing invitation as gone (404)', () =>
    expect(linkRefusal(false, true, false)).toEqual({ reason: 'gone', status: 404 }));
  it('reports a malformed link to a missing invitation as invalid (403)', () =>
    expect(linkRefusal(false, false, false)).toEqual({ reason: 'invalid', status: 403 }));
  it('refuses a bad answer or a bad signature on an existing invitation as invalid (403)', () => {
    expect(linkRefusal(true, false, false)).toEqual({ reason: 'invalid', status: 403 });
    expect(linkRefusal(true, true, false)).toEqual({ reason: 'invalid', status: 403 });
  });
});

describe('REFUSAL_TEXT', () => {
  it('has a title and a message for every reason', () => {
    for (const reason of ['invalid', 'gone', 'locked', 'eventGone', 'past'] as const) {
      expect(REFUSAL_TEXT[reason].title.length).toBeGreaterThan(0);
      expect(REFUSAL_TEXT[reason].message.length).toBeGreaterThan(0);
    }
  });
});

describe('responseCommentKey', () => {
  it('matches the client key', () => {
    expect(responseCommentKey('accepted')).toBe('@relationship/invitation/feature.comment.accepted');
    expect(responseCommentKey('declined')).toBe('@relationship/invitation/feature.comment.declined');
  });
});

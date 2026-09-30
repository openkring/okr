import { Attendee, AvatarInfo, InvitationState } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { applyInvitationAnswer, toAttendeeState } from './attendee.util';

/**
 * 'maybe' left InvitationState on 2026-09-14 (no user-facing path ever offered it). Documents
 * written before that still hold it, so the folding behaviour stays under test — the cast is the
 * point, not an oversight.
 */
const LEGACY_MAYBE = 'maybe' as InvitationState;

describe('toAttendeeState', () => {
  it('narrows an invitation state to the attendee vocabulary', () => {
    expect(toAttendeeState('accepted')).toBe('accepted');
    expect(toAttendeeState('declined')).toBe('declined');
    expect(toAttendeeState('pending')).toBe('invited');
    // 'maybe' was removed from InvitationState on 2026-09-14; legacy documents still carry it
    expect(toAttendeeState(LEGACY_MAYBE)).toBe('invited');
  });
});

describe('applyInvitationAnswer', () => {
  const person = (key: string): AvatarInfo =>
    ({ key, name1: key, name2: '', modelType: 'person', type: '', subType: '', label: '' });
  const keys = (attendees: Attendee[]): string[] => attendees.map(a => a.person.key);
  const stateOf = (attendees: Attendee[], key: string): string | undefined =>
    attendees.find(a => a.person.key === key)?.state;

  it('records an acceptance for somebody not in the list yet', () => {
    expect(applyInvitationAnswer([], person('p1'), 'accepted'))
      .toEqual([{ person: person('p1'), state: 'accepted' }]);
  });

  it('maps pending and the retired maybe onto the unanswered state', () => {
    expect(stateOf(applyInvitationAnswer([], person('p1'), 'pending'), 'p1')).toBe('invited');
    expect(stateOf(applyInvitationAnswer([], person('p1'), LEGACY_MAYBE), 'p1')).toBe('invited');
  });

  it('moves somebody accepting from a non-accepted state to the END of the queue', () => {
    const before: Attendee[] = [
      { person: person('p1'), state: 'declined' },
      { person: person('p2'), state: 'accepted' },
    ];
    expect(keys(applyInvitationAnswer(before, person('p1'), 'accepted'))).toEqual(['p2', 'p1']);
  });

  it('keeps the position of somebody who was already accepted', () => {
    const before: Attendee[] = [
      { person: person('p1'), state: 'accepted' },
      { person: person('p2'), state: 'accepted' },
    ];
    expect(keys(applyInvitationAnswer(before, person('p1'), 'accepted'))).toEqual(['p1', 'p2']);
  });

  it('keeps the position when declining — declining occupies no seat anyway', () => {
    const before: Attendee[] = [
      { person: person('p1'), state: 'accepted' },
      { person: person('p2'), state: 'accepted' },
    ];
    const after = applyInvitationAnswer(before, person('p1'), 'declined');
    expect(keys(after)).toEqual(['p1', 'p2']);
    expect(stateOf(after, 'p1')).toBe('declined');
  });

  it('never drops an invitee who resets their answer to pending', () => {
    const before: Attendee[] = [{ person: person('p1'), state: 'accepted' }];
    const after = applyInvitationAnswer(before, person('p1'), 'pending');
    expect(keys(after)).toEqual(['p1']);
    expect(stateOf(after, 'p1')).toBe('invited');
  });

  it('leaves everybody else untouched and does not mutate the input', () => {
    const before: Attendee[] = [{ person: person('p2'), state: 'accepted' }];
    const after = applyInvitationAnswer(before, person('p1'), 'declined');
    expect(stateOf(after, 'p2')).toBe('accepted');
    expect(before).toHaveLength(1);
  });
});

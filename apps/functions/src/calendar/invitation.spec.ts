import { describe, expect, it } from 'vitest';
import { invitationPushBody, inviteesToRecompute, shouldNotifyInvitation, shouldRecomputeInvitations } from './invitation';

const inv = { tenants: ['scs'], inviteeKey: 'p', caleventKey: 'e', state: 'pending' };
const event = { name: 'test2', startDate: '20261001', startTime: '11:00' };

describe('shouldNotifyInvitation', () => {
  it('notifies a pending invitation to a future event', () => expect(shouldNotifyInvitation(inv, event, '20260930')).toBe(true));
  it('notifies on the day of the event', () => expect(shouldNotifyInvitation(inv, event, '20261001')).toBe(true));
  it('skips an answered invitation', () => expect(shouldNotifyInvitation({ ...inv, state: 'accepted' }, event, '20260930')).toBe(false));
  it('skips an archived invitation', () => expect(shouldNotifyInvitation({ ...inv, isArchived: true }, event, '20260930')).toBe(false));
  it('skips without tenant, invitee or event key', () => {
    expect(shouldNotifyInvitation({ ...inv, tenants: [] }, event, '20260930')).toBe(false);
    expect(shouldNotifyInvitation({ ...inv, inviteeKey: '' }, event, '20260930')).toBe(false);
    expect(shouldNotifyInvitation({ ...inv, caleventKey: '' }, event, '20260930')).toBe(false);
  });
  it('skips a missing, archived or past event', () => {
    expect(shouldNotifyInvitation(inv, undefined, '20260930')).toBe(false);
    expect(shouldNotifyInvitation(inv, { ...event, isArchived: true }, '20260930')).toBe(false);
    expect(shouldNotifyInvitation(inv, event, '20261002')).toBe(false);
  });
  // Mirrors isCountableInvitation / isCaleventAttendanceClosed (libs/shared/util-core): no push
  // for an invitation the badge and the card would not count (spec 1.127 2.4).
  it('skips a locked invitation', () => expect(shouldNotifyInvitation({ ...inv, isLocked: true }, event, '20260930')).toBe(false));
  it('skips a cancelled event', () => expect(shouldNotifyInvitation(inv, { ...event, state: 'cancelled' }, '20260930')).toBe(false));
  it('skips a locked event', () => expect(shouldNotifyInvitation(inv, { ...event, isLocked: true }, '20260930')).toBe(false));
  it('notifies a provisional or proposed event', () => {
    expect(shouldNotifyInvitation(inv, { ...event, state: 'provisional' }, '20260930')).toBe(true);
    expect(shouldNotifyInvitation(inv, { ...event, state: 'proposed' }, '20260930')).toBe(true);
  });
  it('compares the last day (endDate) of a multi-day event', () => {
    const multiDay = { ...event, startDate: '20260928', endDate: '20261003' };
    expect(shouldNotifyInvitation(inv, multiDay, '20261001')).toBe(true);
    expect(shouldNotifyInvitation(inv, multiDay, '20261003')).toBe(true);
    expect(shouldNotifyInvitation(inv, multiDay, '20261004')).toBe(false);
  });
  it('falls back to startDate when endDate is empty', () => {
    expect(shouldNotifyInvitation(inv, { ...event, endDate: '' }, '20261001')).toBe(true);
    expect(shouldNotifyInvitation(inv, { ...event, endDate: '' }, '20261002')).toBe(false);
  });
  it('treats a legacy event doc without isLocked/state as open', () => {
    expect(shouldNotifyInvitation(inv, { startDate: '20261001' }, '20260930')).toBe(true);
  });
});

describe('invitationPushBody', () => {
  it('names inviter and time', () => expect(invitationPushBody('Bruno Kaiser', '01.10.2026, 11:00')).toBe('Bruno Kaiser lädt dich ein: 01.10.2026, 11:00'));
  it('works without a time', () => expect(invitationPushBody('Bruno Kaiser', '')).toBe('Bruno Kaiser lädt dich ein'));
});

describe('shouldRecomputeInvitations (1.127 B1)', () => {
  const pending = { tenants: ['scs'], inviteeKey: 'p', caleventKey: 'e', state: 'pending', notes: '' };

  it('is false on create (onInvitationCreated recomputes)', () => expect(shouldRecomputeInvitations(undefined, pending)).toBe(false));
  it('is true on delete', () => expect(shouldRecomputeInvitations(pending, undefined)).toBe(true));
  it('is true when the invitation is answered', () => expect(shouldRecomputeInvitations(pending, { ...pending, state: 'accepted' })).toBe(true));
  it('is true when it is archived or locked', () => {
    expect(shouldRecomputeInvitations(pending, { ...pending, isArchived: true })).toBe(true);
    expect(shouldRecomputeInvitations(pending, { ...pending, isLocked: true })).toBe(true);
  });
  it('is true when the invitee changes', () => expect(shouldRecomputeInvitations(pending, { ...pending, inviteeKey: 'q' })).toBe(true));
  it('is false on an unrelated field change', () => expect(shouldRecomputeInvitations(pending, { ...pending, notes: 'bis gleich' })).toBe(false));
  it('is false when nothing exists', () => expect(shouldRecomputeInvitations(undefined, undefined)).toBe(false));

  it('inviteesToRecompute names the old and the new invitee once', () => {
    expect(inviteesToRecompute(pending, { ...pending, inviteeKey: 'q' })).toEqual(['p', 'q']);
    expect(inviteesToRecompute(pending, { ...pending, state: 'declined' })).toEqual(['p']);
    expect(inviteesToRecompute(pending, undefined)).toEqual(['p']);
  });
});

import { describe, expect, it } from 'vitest';
import { answerOfWrite, answerRecipients, eventInTenant, invitationAnswerPushBody, invitationPushBody, inviteesToRecompute, shouldNotifyInvitation, shouldRecomputeInvitations } from './invitation';

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

describe('eventInTenant', () => {
  it('returns an event of the tenant', () => expect(eventInTenant({ name: 'a', tenants: ['scs'] }, ['scs'])?.name).toBe('a'));
  it('returns a shared event of the tenant', () => expect(eventInTenant({ name: 'a', tenants: ['p13', 'scs'] }, ['scs'])?.name).toBe('a'));
  it('hides an event of another tenant', () => expect(eventInTenant({ name: 'a', tenants: ['p13'] }, ['scs'])).toBeUndefined());
  it('hides a missing event and an event without tenants', () => {
    expect(eventInTenant(undefined, ['scs'])).toBeUndefined();
    expect(eventInTenant({ name: 'a' }, ['scs'])).toBeUndefined();
  });
  it('refuses an invitation with a second tenant, in either order', () => {
    expect(eventInTenant({ tenants: ['p13'] }, ['p13', 'scs'])).toBeUndefined();
    expect(eventInTenant({ tenants: ['p13'] }, ['scs', 'p13'])).toBeUndefined();
  });
  it('refuses an invitation without a tenant', () => {
    expect(eventInTenant({ tenants: ['scs'] }, [])).toBeUndefined();
    expect(eventInTenant({ tenants: ['scs'] }, undefined)).toBeUndefined();
  });
});

describe('answerOfWrite', () => {
  const pending = { ...inv, state: 'pending' };
  it('reports a first answer', () => {
    expect(answerOfWrite(pending, { ...inv, state: 'accepted' })).toBe('accepted');
    expect(answerOfWrite(pending, { ...inv, state: 'declined' })).toBe('declined');
  });
  it('reports a changed answer', () => expect(answerOfWrite({ ...inv, state: 'accepted' }, { ...inv, state: 'declined' })).toBe('declined'));
  it('stays quiet when the state did not change', () => expect(answerOfWrite({ ...inv, state: 'accepted' }, { ...inv, state: 'accepted', notes: 'x' })).toBeUndefined());
  it('stays quiet on a reset to pending', () => expect(answerOfWrite({ ...inv, state: 'accepted' }, pending)).toBeUndefined());
  it('stays quiet on create and delete', () => {
    expect(answerOfWrite(undefined, { ...inv, state: 'accepted' })).toBeUndefined();
    expect(answerOfWrite({ ...inv, state: 'accepted' }, undefined)).toBeUndefined();
  });
  it('stays quiet on an archived invitation', () => expect(answerOfWrite(pending, { ...inv, state: 'accepted', isArchived: true })).toBeUndefined());
});

describe('answerRecipients', () => {
  const person = (key: string) => ({ key, name1: '', name2: '', modelType: 'person', type: '', subType: '', label: '' });
  it('takes the organisers and the inviter, each once', () => {
    expect(answerRecipients({ ...inv, inviterKey: 'o2' }, { responsiblePersons: [person('o1'), person('o2')] })).toEqual(['o1', 'o2']);
  });
  it('reaches an inviter who is no organiser', () => {
    expect(answerRecipients({ ...inv, inviterKey: 'i' }, { responsiblePersons: [person('o1')] })).toEqual(['o1', 'i']);
  });
  it('leaves out the person who answered', () => {
    expect(answerRecipients({ ...inv, inviterKey: 'p' }, { responsiblePersons: [person('p')] })).toEqual([]);
  });
  it('copes with a legacy event and a missing inviter', () => expect(answerRecipients(inv, {})).toEqual([]));
});

describe('invitationAnswerPushBody', () => {
  it('says yes or no', () => {
    expect(invitationAnswerPushBody('Anna Muster', 'accepted')).toBe('Anna Muster hat zugesagt');
    expect(invitationAnswerPushBody('Anna Muster', 'declined')).toBe('Anna Muster hat abgesagt');
  });
});

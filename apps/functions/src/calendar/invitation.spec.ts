import { describe, expect, it } from 'vitest';
import { invitationPushBody, shouldNotifyInvitation } from './invitation';

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
});

describe('invitationPushBody', () => {
  it('names inviter and time', () => expect(invitationPushBody('Bruno Kaiser', '01.10.2026, 11:00')).toBe('Bruno Kaiser lädt dich ein: 01.10.2026, 11:00'));
  it('works without a time', () => expect(invitationPushBody('Bruno Kaiser', '')).toBe('Bruno Kaiser lädt dich ein'));
});

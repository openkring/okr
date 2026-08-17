import { describe, expect, it } from 'vitest';

import { InvitationModel } from '@okr/shared-models';

import { inviteeCandidates, isOpenInvitation, openInvitationsOf } from './invitation.util';
import { DateFormat, getTodayStr } from './date.util';

const ME = 'person-me';
const TODAY = getTodayStr(DateFormat.StoreDate);
const PAST = '20200101';
const FUTURE = '29991231';

function invitation(overrides: Partial<InvitationModel> = {}): InvitationModel {
  return Object.assign(new InvitationModel('scs'), {
    okey: 'inv-1',
    inviteeKey: ME,
    caleventKey: 'event-1',
    date: FUTURE,
    state: 'pending',
  }, overrides);
}

describe('isOpenInvitation', () => {
  it('accepts a pending future invitation addressed to the person', () => {
    expect(isOpenInvitation(invitation(), ME)).toBe(true);
  });

  it('accepts an invitation for an event happening today', () => {
    expect(isOpenInvitation(invitation({ date: TODAY }), ME)).toBe(true);
  });

  it('rejects an invitation for a past event', () => {
    expect(isOpenInvitation(invitation({ date: PAST }), ME)).toBe(false);
  });

  it('rejects an answered invitation', () => {
    expect(isOpenInvitation(invitation({ state: 'accepted' }), ME)).toBe(false);
    expect(isOpenInvitation(invitation({ state: 'declined' }), ME)).toBe(false);
  });

  it('rejects an archived invitation', () => {
    expect(isOpenInvitation(invitation({ isArchived: true }), ME)).toBe(false);
  });

  it('rejects an invitation addressed to somebody else', () => {
    expect(isOpenInvitation(invitation({ inviteeKey: 'person-other' }), ME)).toBe(false);
  });

  it('rejects everything when there is no signed-in person', () => {
    expect(isOpenInvitation(invitation(), '')).toBe(false);
  });
});

describe('openInvitationsOf', () => {
  it('keeps only the open ones', () => {
    const open = invitation({ okey: 'open' });
    const list = [
      open,
      invitation({ okey: 'answered', state: 'accepted' }),
      invitation({ okey: 'past', date: PAST }),
      invitation({ okey: 'theirs', inviteeKey: 'person-other' }),
    ];
    expect(openInvitationsOf(list, ME).map(i => i.okey)).toEqual(['open']);
  });

  it('returns an empty list for an empty input', () => {
    expect(openInvitationsOf([], ME)).toEqual([]);
  });
});

describe('inviteeCandidates', () => {
  it('excludes the inviting user', () => {
    expect(inviteeCandidates([ME, 'a', 'b'], [], ME)).toEqual(['a', 'b']);
  });

  it('excludes members who already hold an invitation', () => {
    const existing = [invitation({ inviteeKey: 'a' })];
    expect(inviteeCandidates([ME, 'a', 'b'], existing, ME)).toEqual(['b']);
  });

  it('ignores the state of an existing invitation — a declined member is not re-invited', () => {
    const existing = [invitation({ inviteeKey: 'a', state: 'declined' })];
    expect(inviteeCandidates(['a', 'b'], existing, ME)).toEqual(['b']);
  });

  it('drops empty member keys', () => {
    expect(inviteeCandidates(['', 'a'], [], ME)).toEqual(['a']);
  });

  it('returns an empty list when everybody is already invited', () => {
    const existing = [invitation({ inviteeKey: 'a' }), invitation({ inviteeKey: 'b' })];
    expect(inviteeCandidates([ME, 'a', 'b'], existing, ME)).toEqual([]);
  });
});

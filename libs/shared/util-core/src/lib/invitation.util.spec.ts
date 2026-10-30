import { describe, expect, it } from 'vitest';

import { CalEventModel, InvitationModel } from '@okr/shared-models';

import { countableInvitationsOf, isCountableInvitation, isOpenInvitation, openInvitationsOf } from './invitation.util';
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


function event(overrides: Partial<CalEventModel> = {}): CalEventModel {
  return Object.assign(new CalEventModel('scs'), { okey: 'event-1', startDate: FUTURE, endDate: '' }, overrides);
}

describe('isCountableInvitation', () => {
  it('counts a pending invitation for an open event', () => {
    expect(isCountableInvitation(invitation(), ME, event())).toBe(true);
  });

  it('counts today\'s pending invitation for an event happening today', () => {
    expect(isCountableInvitation(invitation({ date: TODAY }), ME, event({ startDate: TODAY }))).toBe(true);
  });

  it('does not count a locked invitation', () => {
    expect(isCountableInvitation(invitation({ isLocked: true }), ME, event())).toBe(false);
  });

  it('does not count an invitation that is not open', () => {
    expect(isCountableInvitation(invitation({ state: 'accepted' }), ME, event())).toBe(false);
  });

  it('does not count an invitation for a cancelled event', () => {
    expect(isCountableInvitation(invitation(), ME, event({ state: 'cancelled' }))).toBe(false);
  });

  it('does not count an invitation for a locked event', () => {
    expect(isCountableInvitation(invitation(), ME, event({ isLocked: true }))).toBe(false);
  });

  it('does not count an invitation for an event that is over', () => {
    expect(isCountableInvitation(invitation(), ME, event({ startDate: PAST, endDate: '20200102' }))).toBe(false);
  });

  it('does not count an invitation for an archived event', () => {
    expect(isCountableInvitation(invitation(), ME, event({ isArchived: true }))).toBe(false);
  });

  it('does not count an invitation whose event was deleted (null)', () => {
    expect(isCountableInvitation(invitation(), ME, null)).toBe(false);
  });

  it('does not count an invitation whose event is not loaded (undefined)', () => {
    expect(isCountableInvitation(invitation(), ME, undefined)).toBe(false);
  });

  it('counts an invitation without caleventKey, whatever the event argument', () => {
    expect(isCountableInvitation(invitation({ caleventKey: '' }), ME, null)).toBe(true);
    expect(isCountableInvitation(invitation({ caleventKey: '' }), ME, undefined)).toBe(true);
  });
});

describe('countableInvitationsOf', () => {
  it('keeps only the answerable ones, looking each event up by caleventKey', () => {
    const events = new Map<string, CalEventModel | null>([
      ['ev-open', event({ okey: 'ev-open' })],
      ['ev-cancelled', event({ okey: 'ev-cancelled', state: 'cancelled' })],
      ['ev-deleted', null],
    ]);
    const list = [
      invitation({ okey: 'a', caleventKey: 'ev-open' }),
      invitation({ okey: 'b', caleventKey: 'ev-cancelled' }),
      invitation({ okey: 'c', caleventKey: 'ev-deleted' }),
      invitation({ okey: 'd', caleventKey: 'ev-not-loaded' }),
      invitation({ okey: 'e', caleventKey: '' }),
      invitation({ okey: 'f', caleventKey: 'ev-open', state: 'declined' }),
    ];
    expect(countableInvitationsOf(list, ME, events).map(i => i.okey)).toEqual(['a', 'e']);
  });

  it('returns an empty list for an empty input', () => {
    expect(countableInvitationsOf([], ME, new Map())).toEqual([]);
  });
});

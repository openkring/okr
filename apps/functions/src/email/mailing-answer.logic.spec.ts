import { describe, expect, it } from 'vitest';
import { Attendee } from '@okr/shared-models';
import { attendeeStateOf, eventRefusal, invitationRefusal, lastEventDate, mayAnswer } from './mailing-answer.logic';

const doc = {
  deliveries: [{ personKey: 'p1', channels: ['email'] }, { personKey: 'p2', channels: ['chat'] }],
  caleventKeys: ['e1'],
  validUntil: '20261101',
};

describe('mayAnswer', () => {
  it('is true on validUntil itself', () => expect(mayAnswer(doc, 'p1', '20261101')).toBe(true));
  it('is false the day after', () => expect(mayAnswer(doc, 'p1', '20261102')).toBe(false));
  it('is false for a person ticked only for chat', () => expect(mayAnswer(doc, 'p2', '20261101')).toBe(false));
  it('is false without caleventKeys', () => {
    expect(mayAnswer({ ...doc, caleventKeys: undefined }, 'p1', '20261101')).toBe(false);
    expect(mayAnswer({ ...doc, caleventKeys: [] }, 'p1', '20261101')).toBe(false);
  });
  it('is false without validUntil', () => expect(mayAnswer({ ...doc, validUntil: undefined }, 'p1', '20261101')).toBe(false));
});

describe('lastEventDate', () => {
  it('takes the endDate of a multi-day event', () => {
    expect(lastEventDate([{ startDate: '20261001', endDate: '20261003' }, { startDate: '20261002' }])).toBe('20261003');
  });
  it('is undefined for no events', () => expect(lastEventDate([])).toBeUndefined());
});

describe('eventRefusal', () => {
  const keys = ['e1', 'e2'];
  const open = { startDate: '20261201' };
  it('refuses an event outside caleventKeys', () => expect(eventRefusal('x', keys, open, '20261101')).toBe('invalid'));
  it('marks only the cancelled event', () => {
    expect(eventRefusal('e1', keys, open, '20261101')).toBeUndefined();
    expect(eventRefusal('e2', keys, { ...open, state: 'cancelled' }, '20261101')).toBe('cancelled');
  });
  it('is eventGone for a missing or archived event', () => {
    expect(eventRefusal('e1', keys, undefined, '20261101')).toBe('eventGone');
    expect(eventRefusal('e1', keys, { ...open, isArchived: true }, '20261101')).toBe('eventGone');
  });
  it('is past before today, using endDate over startDate', () => {
    expect(eventRefusal('e1', keys, { startDate: '20261001' }, '20261101')).toBe('past');
    expect(eventRefusal('e1', keys, { startDate: '20261001', endDate: '20261101' }, '20261101')).toBeUndefined();
  });
  it('is locked for a locked event', () => expect(eventRefusal('e1', keys, { ...open, isLocked: true }, '20261101')).toBe('locked'));
});

describe('attendeeStateOf', () => {
  const att = (key: string, state: string): Attendee => ({ person: { key, name1: key, name2: '', label: '', type: 'person' }, state } as unknown as Attendee);
  it('is open when absent', () => {
    expect(attendeeStateOf(undefined, undefined, 'p1')).toBe('open');
    expect(attendeeStateOf([att('p1', 'invited')], undefined, 'p1')).toBe('open');
  });
  it('is accepted within the cap and waiting beyond it', () => {
    const list = [att('a', 'accepted'), att('p1', 'accepted')];
    expect(attendeeStateOf(list, 2, 'p1')).toBe('accepted');
    expect(attendeeStateOf(list, 1, 'p1')).toBe('waiting');
  });
  it('is declined for a declined entry', () => expect(attendeeStateOf([att('p1', 'declined')], 1, 'p1')).toBe('declined'));
});

describe('invitationRefusal', () => {
  it('is locked for a live locked invitation', () => expect(invitationRefusal({ isLocked: true })).toBe('locked'));
  it('ignores archived, absent and unlocked invitations', () => {
    expect(invitationRefusal({ isLocked: true, isArchived: true })).toBeUndefined();
    expect(invitationRefusal(undefined)).toBeUndefined();
    expect(invitationRefusal({ isLocked: false })).toBeUndefined();
  });
});

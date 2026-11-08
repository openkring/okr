import { describe, expect, it } from 'vitest';
import { Attendee } from '@okr/shared-models';
import {
  mailingAnswerColor, mailingAnswerCounts, mailingAnswerOf, mailingChannelCounts, mailingRecipientsFor, mailingStateColor,
  mailJobProgress, sortMailingsNewestFirst,
} from './mailing.util';

const att = (key: string, state: Attendee['state']): Attendee => ({ person: { key, name1: '', name2: '', modelType: 'person', label: '' }, state } as Attendee);

describe('sortMailingsNewestFirst', () => {
  it('puts the newest first and an undated one last, without touching the input', () => {
    const input = [{ createdAt: '20261101120000' }, {}, { createdAt: '20261105080000' }];
    expect(sortMailingsNewestFirst(input).map((m) => m.createdAt)).toEqual(['20261105080000', '20261101120000', undefined]);
    expect(input[0].createdAt).toBe('20261101120000');
  });
});

describe('mailingChannelCounts / mailingRecipientsFor', () => {
  const deliveries = [{ personKey: 'a', channels: ['email', 'chat'] }, { personKey: 'b', channels: ['post'] }, { personKey: 'c', channels: ['email'] }];
  it('counts the ticks per delivery type, zero for an unused one', () => {
    expect(mailingChannelCounts(deliveries)).toEqual({ email: 2, chat: 1, post: 1 });
    expect(mailingChannelCounts(undefined)).toEqual({ email: 0, chat: 0, post: 0 });
  });
  it('lists the recipients of one type in order', () => {
    expect(mailingRecipientsFor(deliveries, 'email')).toEqual(['a', 'c']);
    expect(mailingRecipientsFor(undefined, 'email')).toEqual([]);
  });
});

describe('mailingStateColor', () => {
  it('maps the states', () => {
    expect(mailingStateColor('failed')).toBe('danger');
    expect(mailingStateColor('sent')).toBe('success');
    expect(mailingStateColor('sent', true)).toBe('warning');
    expect(mailingStateColor('pending')).toBe('medium');
    expect(mailingStateColor(undefined)).toBe('medium');
  });
});

describe('mailJobProgress', () => {
  it('shows sent/total once a total is known', () => {
    expect(mailJobProgress({ blocksSent: 3, blocksTotal: 5 })).toBe('3/5');
    expect(mailJobProgress({ blocksTotal: 2 })).toBe('0/2');
    expect(mailJobProgress({})).toBe('');
    expect(mailJobProgress(undefined)).toBe('');
  });
});

describe('mailingAnswerOf', () => {
  const attendees = [att('a', 'accepted'), att('b', 'declined'), att('c', 'accepted'), att('d', 'invited')];
  it('reads yes, no and open', () => {
    expect(mailingAnswerOf(attendees, undefined, 'a')).toBe('accepted');
    expect(mailingAnswerOf(attendees, 0, 'c')).toBe('accepted');
    expect(mailingAnswerOf(attendees, undefined, 'b')).toBe('declined');
    expect(mailingAnswerOf(attendees, undefined, 'd')).toBe('open');
    expect(mailingAnswerOf(attendees, undefined, 'x')).toBe('open');
    expect(mailingAnswerOf(undefined, undefined, 'a')).toBe('open');
  });
  it('puts a yes beyond maxAttendees on the waiting list', () => {
    expect(mailingAnswerOf(attendees, 1, 'a')).toBe('accepted');
    expect(mailingAnswerOf(attendees, 1, 'c')).toBe('waiting');
  });
});

describe('mailingAnswerCounts / mailingAnswerColor', () => {
  it('counts every answer', () => {
    expect(mailingAnswerCounts(['accepted', 'open', 'open', 'declined'])).toEqual({ accepted: 1, waiting: 0, declined: 1, open: 2 });
  });
  it('colors the badges', () => {
    expect(['accepted', 'waiting', 'declined', 'open'].map((a) => mailingAnswerColor(a as never))).toEqual(['success', 'warning', 'danger', 'medium']);
  });
});

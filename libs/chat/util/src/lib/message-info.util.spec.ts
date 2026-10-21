import { describe, expect, it } from 'vitest';

import { messageTypeLabelKey, readersOfMessage, storeDateTimeOfMs, InfoReceipt } from './message-info.util';

describe('messageTypeLabelKey', () => {
  it('maps the text-like msgtypes to text', () => {
    for (const t of ['m.text', 'm.notice', 'm.emote']) expect(messageTypeLabelKey(t)).toBe('info_type_text');
  });

  it('maps media msgtypes', () => {
    expect(messageTypeLabelKey('m.image')).toBe('info_type_image');
    expect(messageTypeLabelKey('m.file')).toBe('info_type_file');
    expect(messageTypeLabelKey('m.video')).toBe('info_type_video');
    expect(messageTypeLabelKey('m.audio')).toBe('info_type_audio');
    expect(messageTypeLabelKey('m.location')).toBe('info_type_location');
  });

  it('maps the poll start event', () => {
    expect(messageTypeLabelKey('org.matrix.msc3381.poll.start')).toBe('info_type_poll');
    expect(messageTypeLabelKey('m.room.message', 'm.image')).toBe('info_type_image');
  });

  it('prefers the msgtype over the event type and falls back to «message»', () => {
    expect(messageTypeLabelKey('m.room.message', 'm.video')).toBe('info_type_video');
    expect(messageTypeLabelKey('m.room.message')).toBe('info_type_other');
    expect(messageTypeLabelKey('x.custom', 'x.weird')).toBe('info_type_other');
    expect(messageTypeLabelKey('')).toBe('info_type_other');
  });
});

const r = (userId: string, ts: number): InfoReceipt => ({ userId, displayName: userId, ts });

describe('readersOfMessage', () => {
  const order = ['$1', '$2', '$3'];

  it('counts receipts on this event and on later ones, not earlier ones', () => {
    const map = new Map([['$1', [r('a', 1)]], ['$2', [r('b', 2)]], ['$3', [r('c', 3)]]]);
    expect(readersOfMessage('$2', order, map).map((x) => x.userId)).toEqual(['b', 'c']);
  });

  it('keeps one entry per person, the newest receipt', () => {
    const map = new Map([['$2', [r('a', 5)]], ['$3', [r('a', 9)]]]);
    expect(readersOfMessage('$1', order, map)).toEqual([r('a', 9)]);
  });

  it('falls back to the own event when the message is not in the timeline', () => {
    const map = new Map([['$x', [r('a', 1)]], ['$3', [r('c', 3)]]]);
    expect(readersOfMessage('$x', order, map).map((x) => x.userId)).toEqual(['a']);
  });

  it('is empty without receipts', () => {
    expect(readersOfMessage('$1', order, new Map())).toEqual([]);
  });
});

describe('storeDateTimeOfMs', () => {
  it('renders the local wall clock as yyyyMMddHHmmss', () => {
    expect(storeDateTimeOfMs(new Date(2026, 9, 5, 14, 3, 9).getTime())).toBe('20261005140309');
  });
});

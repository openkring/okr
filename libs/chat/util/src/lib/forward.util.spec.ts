import { describe, expect, it } from 'vitest';

import { buildForwardContent, ForwardedFrom, isForwardable, OKR_FORWARDED_FIELD, readForwarded } from './forward.util';

const FROM: ForwardedFrom = { sender: '@a:hs', senderName: 'Anna', roomId: '!r:hs', eventId: '$e' };

describe('isForwardable', () => {
  it('accepts the plain message types', () => {
    for (const msgtype of ['m.text', 'm.notice', 'm.emote', 'm.image', 'm.file', 'm.video', 'm.audio']) {
      expect(isForwardable('m.room.message', { msgtype, body: 'x' }, false)).toBe(true);
    }
  });

  it('rejects polls, calls and unknown types', () => {
    expect(isForwardable('org.matrix.msc3381.poll.start', { body: 'x' }, false)).toBe(false);
    expect(isForwardable('m.call.invite', { body: 'x' }, false)).toBe(false);
    expect(isForwardable('m.room.message', { msgtype: 'm.location', body: 'x' }, false)).toBe(false);
  });

  it('rejects redacted messages (empty content)', () => {
    expect(isForwardable('m.room.message', {}, false)).toBe(false);
  });

  it('rejects bookmark entries', () => {
    expect(isForwardable('m.room.message', { msgtype: 'm.text', body: 'x' }, true)).toBe(false);
  });
});

describe('buildForwardContent', () => {
  it('keeps the payload fields and drops the rest', () => {
    const out = buildForwardContent(
      {
        msgtype: 'm.image',
        body: 'pic.png',
        format: 'org.matrix.custom.html',
        formatted_body: '<b>x</b>',
        url: 'mxc://hs/abc',
        info: { w: 1 },
        filename: 'pic.png',
        'm.new_content': { body: 'edit' },
        'm.relates_to': { rel_type: 'm.thread', event_id: '$t' },
        'org.okr.bookmark': { x: 1 },
      },
      FROM,
    );
    expect(out).toEqual({
      msgtype: 'm.image',
      body: 'pic.png',
      format: 'org.matrix.custom.html',
      formatted_body: '<b>x</b>',
      url: 'mxc://hs/abc',
      info: { w: 1 },
      filename: 'pic.png',
      'm.mentions': {},
      [OKR_FORWARDED_FIELD]: FROM,
    });
  });

  it('replaces mention anchors by their plain text', () => {
    const out = buildForwardContent(
      { msgtype: 'm.text', body: 'Hi Name', format: 'org.matrix.custom.html', formatted_body: 'Hi <a href="https://matrix.to/#/@x:hs">Name</a>, <a href="https://example.org">link</a>' },
      FROM,
    );
    expect(out['formatted_body']).toBe('Hi Name, <a href="https://example.org">link</a>');
  });

  it('replaces an existing forwarded marker', () => {
    const out = buildForwardContent({ msgtype: 'm.text', body: 'x', [OKR_FORWARDED_FIELD]: { sender: '@old:hs' } }, FROM);
    expect(out[OKR_FORWARDED_FIELD]).toEqual(FROM);
  });

  it('does not mutate the input', () => {
    const input = { msgtype: 'm.text', body: 'x', 'm.relates_to': { event_id: '$t' } };
    buildForwardContent(input, FROM);
    expect(input['m.relates_to']).toBeDefined();
  });
});

describe('readForwarded', () => {
  it('returns the marker when all four fields are set', () => {
    expect(readForwarded({ [OKR_FORWARDED_FIELD]: FROM })).toEqual(FROM);
  });

  it('returns undefined for missing, empty or malformed markers', () => {
    expect(readForwarded(undefined)).toBeUndefined();
    expect(readForwarded({})).toBeUndefined();
    expect(readForwarded({ [OKR_FORWARDED_FIELD]: { ...FROM, eventId: '' } })).toBeUndefined();
    expect(readForwarded({ [OKR_FORWARDED_FIELD]: { ...FROM, roomId: 5 } })).toBeUndefined();
    expect(readForwarded({ [OKR_FORWARDED_FIELD]: 'x' })).toBeUndefined();
  });
});

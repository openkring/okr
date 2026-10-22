import { describe, expect, it } from 'vitest';

import {
  buildForwardContent, ForwardedFrom, ForwardedNameSource, isForwardable, isMatrixUserId, OKR_FORWARDED_FIELD, readForwarded,
  verifiedForwardedNames,
} from './forward.util';

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

  it('accepts a MatrixMessage.type that carries the msgtype', () => {
    expect(isForwardable('m.text', { msgtype: 'm.text', body: 'x' }, false)).toBe(true);
    expect(isForwardable('m.image', { msgtype: 'm.image', body: 'x' }, false)).toBe(true);
    expect(isForwardable('m.text', { msgtype: 'm.location', body: 'x' }, false)).toBe(false);
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

  it('strips the reply fallback from body and formatted_body', () => {
    const out = buildForwardContent(
      {
        msgtype: 'm.text',
        body: '> <@b:hs> quoted\nmore\n\nmy answer',
        format: 'org.matrix.custom.html',
        formatted_body:
          '<mx-reply><blockquote><a href="https://matrix.to/#/!r:hs/$q">In reply to</a> <a href="https://matrix.to/#/@b:hs">Bob</a><br>quoted<br>more</blockquote></mx-reply>my <a href="https://matrix.to/#/@c:hs">Cy</a> answer',
        'm.relates_to': { 'm.in_reply_to': { event_id: '$q' } },
      },
      FROM,
    );
    expect(out['body']).toBe('my answer');
    expect(out['formatted_body']).toBe('my Cy answer');
    expect(out['m.relates_to']).toBeUndefined();
  });

  it('keeps a body that merely contains a quote marker later', () => {
    const out = buildForwardContent({ msgtype: 'm.text', body: 'hi\n\n> <@b:hs> x' }, FROM);
    expect(out['body']).toBe('hi\n\n> <@b:hs> x');
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

describe('isMatrixUserId', () => {
  it('accepts well-formed ids, with or without a port', () => {
    expect(isMatrixUserId('@anna:example.org')).toBe(true);
    expect(isMatrixUserId('@a.b_c=d/e+f-g:matrix.example.org')).toBe(true);
    expect(isMatrixUserId('@anna:example.org:8448')).toBe(true);
    expect(isMatrixUserId('@anna:localhost')).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(isMatrixUserId('anna:example.org')).toBe(false); // missing @
    expect(isMatrixUserId('@anna')).toBe(false); // missing server
    expect(isMatrixUserId('@anna:')).toBe(false);
    expect(isMatrixUserId('@Anna:example.org')).toBe(false); // uppercase localpart
    expect(isMatrixUserId('@an na:example.org')).toBe(false); // space
    expect(isMatrixUserId('@anna:exa mple.org')).toBe(false);
    expect(isMatrixUserId('')).toBe(false);
  });
});

describe('verifiedForwardedNames', () => {
  const ORIG: ForwardedFrom = { sender: '@anna:hs', senderName: 'Fake', roomId: '!r:hs', eventId: '$orig' };
  const fwd = (eventId: string, from: ForwardedFrom): ForwardedNameSource =>
    ({ eventId, sender: '@bob:hs', senderName: 'Bob', content: { msgtype: 'm.text', body: 'x', [OKR_FORWARDED_FIELD]: from } });
  const senderOf = (sender: string | undefined) => () => sender;

  it('names the original author when the local sender matches the claim', () => {
    const anna: ForwardedNameSource = { eventId: '$a', sender: '@anna:hs', senderName: 'Anna Muster', content: { body: 'hi' } };
    expect(verifiedForwardedNames([fwd('$f', ORIG), anna], senderOf('@anna:hs')).get('$f')).toBe('Anna Muster');
  });

  it('falls back to the localpart, never to the claimed name', () => {
    expect(verifiedForwardedNames([fwd('$f', ORIG)], senderOf('@anna:hs')).get('$f')).toBe('anna');
  });

  it('gives no name when the original is not held locally or its sender differs', () => {
    expect(verifiedForwardedNames([fwd('$f', ORIG)], senderOf(undefined)).has('$f')).toBe(false);
    expect(verifiedForwardedNames([fwd('$f', ORIG)], senderOf('@eve:hs')).has('$f')).toBe(false);
  });

  it('gives no name for a malformed claimed sender', () => {
    const bad = { ...ORIG, sender: 'Anna' };
    expect(verifiedForwardedNames([fwd('$f', bad)], senderOf('Anna')).has('$f')).toBe(false);
  });

  it('ignores messages that are no forwards', () => {
    const plain: ForwardedNameSource = { eventId: '$p', sender: '@bob:hs', senderName: 'Bob', content: { body: 'x' } };
    expect(verifiedForwardedNames([plain], senderOf('@bob:hs')).size).toBe(0);
  });
});

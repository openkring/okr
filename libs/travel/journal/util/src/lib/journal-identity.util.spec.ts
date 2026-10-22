import { describe, expect, it } from 'vitest';
import { formatHlc } from './journal-hlc.util';
import { nextBoundAuthor, parseBoundAuthor, parseStamp, serializeBoundAuthor } from './journal-identity.util';

describe('journal identity', () => {
  it('parseBoundAuthor reads a stored author', () => {
    const raw = serializeBoundAuthor({ personKey: 'p-bruno', name: 'Bruno Kaiser' });
    expect(parseBoundAuthor(raw)).toEqual({ personKey: 'p-bruno', name: 'Bruno Kaiser' });
  });

  it('parseBoundAuthor rejects garbage', () => {
    expect(parseBoundAuthor(undefined)).toBeUndefined();
    expect(parseBoundAuthor('{')).toBeUndefined();
    expect(parseBoundAuthor('{}')).toBeUndefined();
    expect(parseBoundAuthor('{"name":"x"}')).toBeUndefined();
    expect(parseBoundAuthor('{"personKey":""}')).toBeUndefined();
  });

  it('parseStamp restores clock and seq', () => {
    const hlc = formatHlc({ wall: 1792672881000, counter: 3, deviceId: 'dev-a' });
    expect(parseStamp(hlc, '42', 'dev-a')).toEqual({ clock: { wall: 1792672881000, counter: 3, deviceId: 'dev-a' }, seq: 42 });
  });

  it('parseStamp starts fresh on missing values', () => {
    expect(parseStamp(undefined, undefined, 'dev-a')).toEqual({ clock: undefined, seq: 0 });
    expect(parseStamp('garbage', 'x', 'dev-a')).toEqual({ clock: undefined, seq: 0 });
  });

  it('parseStamp ignores a clock of another device', () => {
    const hlc = formatHlc({ wall: 1000, counter: 0, deviceId: 'dev-b' });
    expect(parseStamp(hlc, '5', 'dev-a')).toEqual({ clock: undefined, seq: 5 });
  });

  it('nextBoundAuthor binds a first author', () => {
    expect(nextBoundAuthor(undefined, { personKey: 'kaiser', name: '' })).toEqual({ personKey: 'kaiser', name: '' });
  });

  it('nextBoundAuthor never replaces a known name with an empty one', () => {
    const current = { personKey: 'kaiser', name: 'Bruno Kaiser' };
    expect(nextBoundAuthor(current, { personKey: 'kaiser', name: '' })).toBeUndefined();
  });

  it('nextBoundAuthor fills in a name that arrives later', () => {
    expect(nextBoundAuthor({ personKey: 'kaiser', name: '' }, { personKey: 'kaiser', name: 'Bruno Kaiser' }))
      .toEqual({ personKey: 'kaiser', name: 'Bruno Kaiser' });
  });

  it('nextBoundAuthor reports no change for the same author', () => {
    const current = { personKey: 'kaiser', name: 'Bruno Kaiser' };
    expect(nextBoundAuthor(current, { ...current })).toBeUndefined();
  });
});

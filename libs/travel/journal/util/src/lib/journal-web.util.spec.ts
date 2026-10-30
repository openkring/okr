import { JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { isWebDeviceId, maxSeqOf, mergePending, mergeStamps, receiveClocksInto } from './journal-web.util';

const rec = (id: string, deviceId = 'dev', seq = 1) => ({ id, deviceId, seq }) as unknown as JournalChange;

describe('isWebDeviceId', () => {
  it('accepts a UUID and rejects unusable ids', () => {
    expect(isWebDeviceId('3f1c2b4e-8a7d-4c1e-9b2a-0d6f5e4c3b2a')).toBe(true);
    expect(isWebDeviceId('')).toBe(false);
    expect(isWebDeviceId('a:b')).toBe(false);
    expect(isWebDeviceId('x'.repeat(65))).toBe(false);
    expect(isWebDeviceId(42)).toBe(false);
  });
});

describe('mergeStamps', () => {
  it('keeps the later clock and the higher seq', () => {
    const a = { clock: { wall: 100, counter: 2, deviceId: 'd' }, seq: 5 };
    const b = { clock: { wall: 100, counter: 3, deviceId: 'd' }, seq: 4 };
    expect(mergeStamps(a, b)).toEqual({ clock: { wall: 100, counter: 3, deviceId: 'd' }, seq: 5 });
  });
  it('takes the other clock when one is undefined', () => {
    const b = { clock: { wall: 7, counter: 0, deviceId: 'd' }, seq: 1 };
    expect(mergeStamps({ clock: undefined, seq: 0 }, b).clock).toEqual(b.clock);
    expect(mergeStamps(b, { clock: undefined, seq: 0 }).clock).toEqual(b.clock);
  });
});

describe('maxSeqOf', () => {
  it('counts only this device', () => {
    expect(maxSeqOf([rec('a', 'x', 3), rec('b', 'y', 9), rec('c', 'x', 5)], 'x')).toBe(5);
    expect(maxSeqOf([], 'x')).toBe(0);
  });
});

describe('receiveClocksInto', () => {
  it('moves past a remote hlc and ignores a malformed one', () => {
    const stamp = { clock: { wall: 10, counter: 0, deviceId: 'me' }, seq: 2 };
    const remote = formatHlc({ wall: 500, counter: 4, deviceId: 'other' });
    const out = receiveClocksInto(stamp, [remote], 'me', 100);
    expect(out.clock).toEqual({ wall: 500, counter: 5, deviceId: 'me' });
    expect(out.seq).toBe(2);
    expect(receiveClocksInto(stamp, ['garbage'], 'me', 5)).toEqual(stamp);
  });
});

describe('mergePending', () => {
  it('appends unconfirmed and drops confirmed', () => {
    const [a, b, c] = [rec('a'), rec('b'), rec('c')];
    expect(mergePending([a, b], [b, c])).toEqual({ changes: [a, b, c], pending: [c] });
  });
  it('returns the snapshot unchanged with empty pending', () => {
    const a = rec('a');
    expect(mergePending([a], [])).toEqual({ changes: [a], pending: [] });
  });
});

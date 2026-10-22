import { describe, expect, it } from 'vitest';
import { formatHlc } from './journal-hlc.util';
import { createChange, NewChange } from './journal-change.util';

const draft: NewChange = {
  id: 'c1', journalKey: 'j1', deviceId: 'dev-a', authorKey: 'bruno',
  entity: 'footprint', entityKey: 'f1', op: 'create', fields: { title: 'Neko Harbour' },
};

describe('createChange', () => {
  it('createChange stamps seq and hlc from the last stamp', () => {
    const { change, stamp } = createChange(draft, { clock: undefined, seq: 0 }, 1000);
    expect(change.seq).toBe(1);
    expect(change.hlc).toBe(formatHlc({ wall: 1000, counter: 0, deviceId: 'dev-a' }));
    expect(stamp.seq).toBe(1);
    expect(stamp.clock).toEqual({ wall: 1000, counter: 0, deviceId: 'dev-a' });
  });

  it('two changes in one millisecond get increasing seq and hlc', () => {
    const first = createChange(draft, { clock: undefined, seq: 0 }, 1000);
    const second = createChange({ ...draft, id: 'c2' }, first.stamp, 1000);
    expect(second.change.seq).toBe(2);
    expect(second.change.hlc > first.change.hlc).toBe(true);
  });

  it('createChange copies only the given fields', () => {
    const { change } = createChange(draft, { clock: undefined, seq: 0 }, 1000);
    expect(change.fields).toEqual({ title: 'Neko Harbour' });
    expect(Object.keys(change).sort()).toEqual(['authorKey', 'deviceId', 'entity', 'entityKey', 'fields', 'hlc', 'id', 'journalKey', 'op', 'seq']);
  });
});

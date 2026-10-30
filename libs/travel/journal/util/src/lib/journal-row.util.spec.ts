import { describe, expect, it } from 'vitest';
import { decodeChangeRow, encodeBases } from './journal-row.util';

const row = {
  id: 'c1', journalKey: 'j1', deviceId: 'dev-a', seq: 3, hlc: '000000000001000:000000:dev-a', authorKey: 'bruno',
  entity: 'footprint', entityKey: 'f1', op: 'set', fields: '{"title":"Neko"}',
};

describe('decodeChangeRow', () => {
  it('decodes a stored row', () => {
    expect(decodeChangeRow(row)).toEqual({ ...row, fields: { title: 'Neko' } });
  });

  it('a row with damaged fields is skipped, not thrown', () => {
    expect(decodeChangeRow({ ...row, fields: '{"title":' })).toBeUndefined();
    expect(decodeChangeRow({ ...row, fields: '"text"' })).toBeUndefined();
  });

  it('a row with an unknown entity or op is skipped', () => {
    expect(decodeChangeRow({ ...row, entity: 'nonsense' })).toBeUndefined();
    expect(decodeChangeRow({ ...row, op: 'drop' })).toBeUndefined();
  });

  it('a row stored before phase 2 (no bases column value) decodes as a legacy record', () => {
    expect(decodeChangeRow({ ...row, bases: null })).not.toHaveProperty('bases');
    expect(decodeChangeRow(row)).not.toHaveProperty('bases');
  });

  it('bases round-trip through the stored row, the first-write sentinel included', () => {
    const bases = { title: '', html: '000000000000900:000000:dev-b' };
    const decoded = decodeChangeRow({ ...row, bases: encodeBases(bases) });
    expect(decoded?.bases).toEqual(bases);
    expect(decodeChangeRow({ ...row, bases: encodeBases({}) })?.bases).toEqual({});
  });

  it('a change without bases is stored as NULL', () => {
    expect(encodeBases(undefined)).toBeNull();
  });

  it('a damaged bases value drops the bases, never the record', () => {
    expect(decodeChangeRow({ ...row, bases: '{"title":' })).toEqual({ ...row, fields: { title: 'Neko' } });
    expect(decodeChangeRow({ ...row, bases: '{"title":3}' })).not.toHaveProperty('bases');
    expect(decodeChangeRow({ ...row, bases: '["x"]' })).not.toHaveProperty('bases');
  });
});

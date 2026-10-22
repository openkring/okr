import { describe, expect, it } from 'vitest';
import { decodeChangeRow } from './journal-row.util';

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
});

import { describe, expect, it } from 'vitest';

import { copyStatus, listCopyTextKey, LIST_COPY_I18N_KEYS } from './list-copy.util';

interface Doc { okey: string; tenants?: string[]; items: string[]; }
const names = (doc: Doc) => doc.items;
const doc = (okey: string, tenants: string[], ...items: string[]): Doc => ({ okey, tenants, items });

const system = doc('sys', ['system'], 'email', 'phone', 'web', 'twitter');

describe('copyStatus', () => {
  it('is shared when the tenant has no document of its own', () => {
    expect(copyStatus([system], 'scs', names)).toEqual({ kind: 'shared', shared: system, missing: [] });
  });

  it('is shared when the own document also names another tenant', () => {
    const both = doc('b', ['scs', 'kring'], 'email');
    expect(copyStatus([both], 'scs', names)).toEqual({ kind: 'shared', shared: both, missing: [] });
    expect(copyStatus([system, both], 'scs', names).kind).toBe('shared');
  });

  it('is own when the tenant owns it alone and there is no system document', () => {
    expect(copyStatus([doc('o', ['scs'], 'email')], 'scs', names)).toEqual({ kind: 'own', missing: [] });
  });

  it('is own for a list that exists nowhere yet', () => {
    expect(copyStatus<Doc>([], 'scs', names)).toEqual({ kind: 'own', missing: [] });
  });

  it('is a copy when the tenant owns one alone beside a system document, in any order', () => {
    const copy = doc('c', ['scs'], 'email', 'phone');
    const expected = { kind: 'copy', shared: system, missing: ['web', 'twitter'] };
    expect(copyStatus([copy, system], 'scs', names)).toEqual(expected);
    expect(copyStatus([system, copy], 'scs', names)).toEqual(expected);
  });

  it('does not take another shared document for the system one', () => {
    const others = doc('x', ['kring', 'bka'], 'email', 'fax');
    expect(copyStatus([doc('o', ['scs'], 'email'), others], 'scs', names).kind).toBe('own');
  });

  it('lists what the copy lacks in shared order, whatever its own order', () => {
    const copy = doc('c', ['scs'], 'twitter', 'email');
    expect(copyStatus([copy, system], 'scs', names).missing).toEqual(['phone', 'web']);
  });

  it('counts a renamed entry as missing and ignores the additional one', () => {
    const copy = doc('c', ['scs'], 'email', 'mobile', 'web', 'twitter');
    expect(copyStatus([copy, system], 'scs', names).missing).toEqual(['phone']);
  });

  it('names a missing entry once', () => {
    const twice = doc('s', ['system'], 'web', 'web');
    expect(copyStatus([doc('c', ['scs']), twice], 'scs', names).missing).toEqual(['web']);
  });
});

describe('listCopyTextKey', () => {
  it('picks the sentence for the state', () => {
    expect(listCopyTextKey({ kind: 'shared', missing: [] })).toBe('shared');
    expect(listCopyTextKey({ kind: 'own', missing: [] })).toBe('own');
    expect(listCopyTextKey({ kind: 'copy', missing: [] })).toBe('own');
    expect(listCopyTextKey({ kind: 'copy', missing: ['a'] })).toBe('copy_one');
    expect(listCopyTextKey({ kind: 'copy', missing: ['a', 'b'] })).toBe('copy_many');
    expect(LIST_COPY_I18N_KEYS.copy_many).toBe('@shared/ui.listCopy.copy_many');
  });
});

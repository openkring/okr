import { describe, expect, it } from 'vitest';

import { adminKeysNeedUpdate, groupAdminKeys } from './group-admin-keys';

describe('groupAdminKeys', () => {
  it('keeps the exact case', () => {
    expect(groupAdminKeys([{ key: 'AbC123' }, { key: 'xYz' }])).toEqual(['AbC123', 'xYz']);
  });
  it('drops duplicates and keeps first-seen order', () => {
    expect(groupAdminKeys([{ key: 'b' }, { key: 'a' }, { key: 'b' }])).toEqual(['b', 'a']);
  });
  it('treats different case as different keys', () => {
    expect(groupAdminKeys([{ key: 'a' }, { key: 'A' }])).toEqual(['a', 'A']);
  });
  it('drops empty and missing keys', () => {
    expect(groupAdminKeys([{ key: '' }, {}, { key: 'a' }])).toEqual(['a']);
  });
  it('handles undefined', () => {
    expect(groupAdminKeys(undefined)).toEqual([]);
  });
});

describe('adminKeysNeedUpdate', () => {
  it('is false when equal (no trigger loop)', () => {
    expect(adminKeysNeedUpdate(['a', 'b'], ['a', 'b'])).toBe(false);
    expect(adminKeysNeedUpdate([], [])).toBe(false);
  });
  it('is false when absent and nothing to write', () => {
    expect(adminKeysNeedUpdate(undefined, [])).toBe(false);
  });
  it('is true when an admin was added', () => {
    expect(adminKeysNeedUpdate(['a'], ['a', 'b'])).toBe(true);
  });
  it('is true when an admin was removed', () => {
    expect(adminKeysNeedUpdate(['a', 'b'], ['a'])).toBe(true);
    expect(adminKeysNeedUpdate(['a'], [])).toBe(true);
  });
  it('is true when the order differs', () => {
    expect(adminKeysNeedUpdate(['a', 'b'], ['b', 'a'])).toBe(true);
  });
  it('is true when absent and there are keys', () => {
    expect(adminKeysNeedUpdate(undefined, ['a'])).toBe(true);
  });
});

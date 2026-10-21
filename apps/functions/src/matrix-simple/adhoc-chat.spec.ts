import { describe, expect, it } from 'vitest';

import { adhocAdminsAfterLeave, adhocChatKey, deriveAdhocChatName } from './adhoc-chat';

describe('adhocChatKey', () => {
  it('prefixes the tenant and marks the document as a chat', () => {
    expect(adhocChatKey('scs', 'a7f3k2b9c1')).toBe('scs_c_a7f3k2b9c1');
  });

  it('never collides with a name-derived group key', () => {
    // getGroupKeyFromName strips everything but [a-z0-9], so it can never produce the
    // `_c_` separator — that is what keeps a chat from overwriting a group document.
    expect(adhocChatKey('scs', 'x').startsWith('scs_c_')).toBe(true);
  });
});

describe('deriveAdhocChatName', () => {
  it('lists the other members', () => {
    expect(deriveAdhocChatName(['Anna', 'Beat', 'Chris'])).toBe('Anna, Beat, Chris');
  });

  it('abbreviates beyond three names', () => {
    expect(deriveAdhocChatName(['Anna', 'Beat', 'Chris', 'Dora', 'Erika'])).toBe('Anna, Beat, Chris +2');
  });

  it('skips empty names', () => {
    expect(deriveAdhocChatName(['Anna', '', '  '])).toBe('Anna');
  });

  it('falls back when no name is usable', () => {
    expect(deriveAdhocChatName([])).toBe('Chat');
  });
});

describe('adhocAdminsAfterLeave', () => {
  const admin = (key: string) => ({ key, name1: key.toUpperCase(), name2: '', modelType: 'person', type: '', subType: '', label: '' });
  const remaining = [
    { personKey: 'b', dateOfEntry: '20260102', name1: 'Beat', name2: 'B' },
    { personKey: 'a', dateOfEntry: '20260101', name1: 'Anna', name2: 'A' },
  ];

  it('leaves the admins alone when a non-admin leaves', () => {
    expect(adhocAdminsAfterLeave([admin('c')], 'x', remaining)).toBeUndefined();
  });

  it('hands over to the earliest remaining member when the creator leaves', () => {
    expect(adhocAdminsAfterLeave([admin('c')], 'c', remaining)).toEqual([
      { key: 'a', name1: 'Anna', name2: 'A', modelType: 'person', type: '', subType: '', label: '' },
    ]);
  });

  it('keeps other admins without adding one', () => {
    expect(adhocAdminsAfterLeave([admin('c'), admin('d')], 'c', remaining)).toEqual([admin('d')]);
  });

  it('empties the list when nobody remains', () => {
    expect(adhocAdminsAfterLeave([admin('c')], 'c', [])).toEqual([]);
  });

  it('tolerates a malformed admins field', () => {
    expect(adhocAdminsAfterLeave(undefined, 'c', remaining)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import { adhocChatKey, deriveAdhocChatName } from './adhoc-chat';

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

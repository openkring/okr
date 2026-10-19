import { ChatBlockedError } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import {
  addChatExemption,
  chatBlockedMessage,
  isChatBlockedError,
  isChatEffectivelyBlocked,
  removeChatExemption,
} from './chat-status.util';

const A = { personKey: 'p1', name: 'A' };
const B = { personKey: 'p2', name: 'B' };

describe('isChatEffectivelyBlocked', () => {
  it('is false without status or when not blocked', () => {
    expect(isChatEffectivelyBlocked(undefined, 'p1')).toBe(false);
    expect(isChatEffectivelyBlocked({ blocked: false }, 'p1')).toBe(false);
  });
  it('is true when blocked and not exempt (also legacy doc without exempt)', () => {
    expect(isChatEffectivelyBlocked({ blocked: true, exempt: [] }, 'p1')).toBe(true);
    expect(isChatEffectivelyBlocked({ blocked: true }, 'p1')).toBe(true);
  });
  it('is false for an exempt person, true without personKey', () => {
    expect(isChatEffectivelyBlocked({ blocked: true, exempt: [A] }, 'p1')).toBe(false);
    expect(isChatEffectivelyBlocked({ blocked: true, exempt: [A] }, undefined)).toBe(true);
  });
});

describe('addChatExemption', () => {
  it('is idempotent and keeps the first entry', () => {
    const r = addChatExemption([A], { personKey: 'p1', name: 'A2' });
    expect(r).toEqual([A]);
  });
  it('handles undefined and returns a new array', () => {
    expect(addChatExemption(undefined, A)).toEqual([A]);
    const list = [A];
    expect(addChatExemption(list, B)).not.toBe(list);
  });
});

describe('removeChatExemption', () => {
  it('removes by personKey', () => {
    expect(removeChatExemption([A, B], 'p1')).toEqual([B]);
  });
  it('returns an unchanged copy for unknown key and [] for undefined', () => {
    const list = [A, B];
    const r = removeChatExemption(list, 'zz');
    expect(r).toEqual(list);
    expect(r).not.toBe(list);
    expect(removeChatExemption(undefined, 'p1')).toEqual([]);
  });
});

describe('isChatBlockedError', () => {
  it('recognises ChatBlockedError and any error while blocked', () => {
    expect(isChatBlockedError(new ChatBlockedError(), false)).toBe(true);
    expect(isChatBlockedError(new Error('Client not initialized'), true)).toBe(true);
    expect(isChatBlockedError(new Error('x'), false)).toBe(false);
  });
});

describe('chatBlockedMessage', () => {
  it('falls back for empty input and trims otherwise', () => {
    expect(chatBlockedMessage('', 'F')).toBe('F');
    expect(chatBlockedMessage('  ', 'F')).toBe('F');
    expect(chatBlockedMessage(' X ', 'F')).toBe('X');
    expect(chatBlockedMessage(undefined, 'F')).toBe('F');
  });
});

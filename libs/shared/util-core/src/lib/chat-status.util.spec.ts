import { ChatBlockedError } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import {
  addChatExemption,
  chatBlockedAlertMessage,
  chatBlockedMessage,
  chatBlockedSince,
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

describe('chatBlockedSince', () => {
  it('is empty without blockedAt', () => {
    expect(chatBlockedSince(undefined, 'seit {time}')).toBe('');
    expect(chatBlockedSince('', 'seit {time}')).toBe('');
  });
  it('fills {time} with the view date-time', () => {
    expect(chatBlockedSince('20261019140500', 'gesperrt seit {time}')).toBe('gesperrt seit 19.10.2026 14:05');
  });
});

describe('chatBlockedAlertMessage', () => {
  it('uses the fallback for an empty message', () => {
    expect(chatBlockedAlertMessage('', 'F')).toBe('F');
  });
  it('escapes the admin message and keeps its line breaks', () => {
    expect(chatBlockedAlertMessage('<b>A</b> & "B"\nC', 'F')).toBe('&lt;b&gt;A&lt;/b&gt; &amp; &quot;B&quot;<br>C');
  });
  it('appends the extra line after a blank line', () => {
    expect(chatBlockedAlertMessage('X', 'F', 'Anrufe sind während der Wartung nicht möglich.'))
      .toBe('X<br><br>Anrufe sind während der Wartung nicht möglich.');
  });
});

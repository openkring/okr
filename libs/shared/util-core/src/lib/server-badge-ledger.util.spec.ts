import { describe, expect, it } from 'vitest';
import { SERVER_BADGE_SEEN_MAX, addChatToLedger, badgeSumDropped, ledgerPartsFromApp, serverBadgeSum, setLedgerPart } from './server-badge-ledger.util';

describe('server badge ledger', () => {
  it('addChatToLedger counts an event once', () => {
    const a = addChatToLedger(undefined, 'e1');
    const b = addChatToLedger(a.next, 'e1');
    expect(a.next.chat).toBe(1);
    expect(a.changed).toBe(true);
    expect(b.next.chat).toBe(1);
    expect(b.changed).toBe(false);
  });

  it('addChatToLedger caps seen at 200, dropping the oldest', () => {
    let l = addChatToLedger(undefined, 'e0').next;
    for (let i = 1; i <= SERVER_BADGE_SEEN_MAX; i++) l = addChatToLedger(l, `e${i}`).next;
    expect(l.seen.length).toBe(SERVER_BADGE_SEEN_MAX);
    expect(l.seen).not.toContain('e0');
    expect(l.seen[l.seen.length - 1]).toBe(`e${SERVER_BADGE_SEEN_MAX}`);
  });

  it('addChatToLedger on a missing doc creates fromApp false', () => {
    const { next } = addChatToLedger(undefined, 'e1');
    expect(next).toEqual({ chat: 1, tasks: 0, invitations: 0, seen: ['e1'], fromApp: false });
  });

  it('setLedgerPart keeps seen and other parts', () => {
    const l = setLedgerPart({ chat: 2, tasks: 1, seen: ['a'], fromApp: true }, 'invitations', 3);
    expect(l).toEqual({ chat: 2, tasks: 1, invitations: 3, seen: ['a'], fromApp: true });
  });

  it('setLedgerPart clamps negative to 0', () => {
    expect(setLedgerPart(undefined, 'tasks', -4).tasks).toBe(0);
  });

  it('ledgerPartsFromApp returns only the given parts', () => {
    expect(ledgerPartsFromApp({ chat: 2 })).toEqual({ chat: 2, fromApp: true });
  });

  it('serverBadgeSum is undefined until the app wrote', () => {
    expect(serverBadgeSum({ chat: 1, tasks: 1, invitations: 1, fromApp: false })).toBeUndefined();
    expect(serverBadgeSum(undefined)).toBeUndefined();
  });

  it('serverBadgeSum sums the three parts', () => {
    expect(serverBadgeSum({ chat: 1, tasks: 2, invitations: 3, fromApp: true })).toBe(6);
  });

  it('badgeSumDropped', () => {
    const l = (chat: number, fromApp = true) => ({ chat, tasks: 0, invitations: 0, fromApp });
    expect(badgeSumDropped(l(5), l(3))).toBe(3);
    expect(badgeSumDropped(l(3), l(5))).toBeUndefined();
    expect(badgeSumDropped(l(5, false), l(3))).toBeUndefined();
    expect(badgeSumDropped(l(5), l(3, false))).toBeUndefined();
    expect(badgeSumDropped(l(1), l(0))).toBe(0);
  });
});

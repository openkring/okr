import { describe, expect, it } from 'vitest';
import { SERVER_BADGE_MAX, SERVER_BADGE_SEEN_MAX, addChatToLedger, allPartsReady, badgeSumDropped, correctionAllowed, countedDeliveredNotifications, isBadgeSourceLoaded, nextCorrectionAt, ledgerPartsFromApp, ledgerPartsToWrite, readyBadgeParts, serverBadgeSum, setLedgerPart } from './server-badge-ledger.util';

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

  it('serverBadgeSum ignores a ledger with a non-numeric part', () => {
    expect(serverBadgeSum({ chat: 'x' as unknown as number, tasks: 1, invitations: 0, fromApp: true })).toBeUndefined();
    expect(serverBadgeSum({ chat: NaN, tasks: 1, invitations: 0, fromApp: true })).toBeUndefined();
    expect(serverBadgeSum({ chat: 1.5, tasks: 1, invitations: 0, fromApp: true })).toBeUndefined();
  });

  it('clamps the sum to 9999', () => {
    expect(serverBadgeSum({ chat: 9999, tasks: 9999, invitations: 9999, fromApp: true })).toBe(SERVER_BADGE_MAX);
    expect(serverBadgeSum({ chat: -5, tasks: 2, invitations: 0, fromApp: true })).toBe(0);
  });

  it('NaN and fractions in setLedgerPart become a clamped integer', () => {
    expect(setLedgerPart(undefined, 'tasks', NaN).tasks).toBe(0);
    expect(setLedgerPart(undefined, 'tasks', 2.9).tasks).toBe(2);
    expect(setLedgerPart(undefined, 'tasks', 99999).tasks).toBe(SERVER_BADGE_MAX);
    expect(ledgerPartsFromApp({ chat: NaN, tasks: 1.7, invitations: 1e9 })).toEqual({ fromApp: true, chat: 0, tasks: 1, invitations: SERVER_BADGE_MAX });
  });

  it("fromApp 'yes' is not fromApp", () => {
    expect(serverBadgeSum({ chat: 1, fromApp: 'yes' as unknown as boolean })).toBeUndefined();
  });

  it('a malformed seen or part is treated as empty / 0 in the ledger helpers', () => {
    const r = addChatToLedger({ chat: 'x' as unknown as number, seen: 'abc' as unknown as string[], fromApp: true }, 'e1');
    expect(r.next).toEqual({ chat: 1, tasks: 0, invitations: 0, seen: ['e1'], fromApp: true });
  });
});

describe('badge part readiness', () => {
  it('skips a part until its source has loaded', () => {
    const ready = { chat: true, tasks: false, invitations: true };
    expect(readyBadgeParts({ chat: 3, tasks: 0, invitations: 0 }, ready)).toEqual({ chat: 3, invitations: 0 });
    expect(allPartsReady(ready)).toBe(false);
  });

  it('returns every part once all sources have loaded', () => {
    const ready = { chat: true, tasks: true, invitations: true };
    expect(readyBadgeParts({ chat: 1, tasks: 2, invitations: 0 }, ready)).toEqual({ chat: 1, tasks: 2, invitations: 0 });
    expect(allPartsReady(ready)).toBe(true);
  });

  it('returns no part while nothing has loaded', () => {
    const ready = { chat: false, tasks: false, invitations: false };
    expect(readyBadgeParts({ chat: 0, tasks: 0, invitations: 0 }, ready)).toEqual({});
    expect(allPartsReady(ready)).toBe(false);
  });
});

describe('ledgerPartsToWrite', () => {
  const server = (chat: number, tasks = 0, invitations = 0, fromApp = true) => ({ chat, tasks, invitations, seen: [], fromApp });

  it('writes when the server chat part is higher than the app\'s', () => {
    expect(ledgerPartsToWrite(server(4), { chat: 0, tasks: 0, invitations: 0 })).toEqual({ chat: 0, tasks: 0, invitations: 0 });
  });

  it('writes nothing when equal', () => {
    expect(ledgerPartsToWrite(server(2, 1, 0), { chat: 2, tasks: 1, invitations: 0 })).toBeUndefined();
    expect(ledgerPartsToWrite(server(2, 1, 0), { chat: 2 })).toBeUndefined();
  });

  it('writes all ready parts when the server doc is missing', () => {
    expect(ledgerPartsToWrite(undefined, { chat: 1, tasks: 2 })).toEqual({ chat: 1, tasks: 2 });
    expect(ledgerPartsToWrite(server(1, 2, 0, false), { chat: 1, tasks: 2 })).toEqual({ chat: 1, tasks: 2 });
  });

  it('never includes a part that is not ready', () => {
    expect(ledgerPartsToWrite(server(5, 5, 5), { tasks: 1 })).toEqual({ tasks: 1 });
    expect(ledgerPartsToWrite(undefined, {})).toBeUndefined();
  });

  it('compares the clamped value, so an over-max count does not rewrite forever', () => {
    expect(ledgerPartsToWrite(server(SERVER_BADGE_MAX), { chat: SERVER_BADGE_MAX + 5 })).toBeUndefined();
  });
});

describe('countedDeliveredNotifications', () => {
  it('keeps only chat, task and invitation notifications', () => {
    const list = [
      { id: '1', data: { type: 'chat' } },
      { id: '2', data: { type: 'task' } },
      { id: '3', data: { badgeAdd: 'invitation' } },
      { id: '4', data: { type: 'calevent' } },
      { id: '5', data: { type: 'video-call' } },
      { id: '6' },
      { id: '7', data: null },
    ];
    expect(countedDeliveredNotifications(list).map((n) => n.id)).toEqual(['1', '2', '3']);
  });
});

// Two open devices of one member whose ready parts differ used to overwrite each other's ledger
// write forever (1.127 final review I1). A pure rolling window (re-review): the gateway's phantom
// chat corrections on an always-open app must keep running, so no hold-until-local-change.
describe('correctionAllowed (ledger write damping)', () => {
  const s = 1000;
  it('allows up to 3 corrections in 60 s', () => {
    expect(correctionAllowed([], 0)).toBe(true);
    expect(correctionAllowed([1 * s], 2 * s)).toBe(true);
    expect(correctionAllowed([1 * s, 2 * s], 3 * s)).toBe(true);
  });

  it('blocks the 4th within 60 s', () => {
    expect(correctionAllowed([1 * s, 10 * s, 20 * s], 30 * s)).toBe(false);
    expect(correctionAllowed([1 * s, 10 * s, 20 * s], 60 * s)).toBe(false);
  });

  it('allows again once the oldest correction is older than 60 s', () => {
    // no local change, no resume: only time passes
    expect(correctionAllowed([1 * s, 10 * s, 20 * s], 61 * s + 1)).toBe(true);
    expect(correctionAllowed([0, 61 * s, 122 * s, 183 * s], 244 * s)).toBe(true);
  });

  it('nextCorrectionAt is just after the oldest correction leaves the window', () => {
    expect(nextCorrectionAt([1 * s, 10 * s, 20 * s], 30 * s)).toBe(61 * s + 1);
    expect(correctionAllowed([1 * s, 10 * s, 20 * s], 61 * s + 1)).toBe(true);
    expect(nextCorrectionAt([], 30 * s)).toBeUndefined();
  });
});

// A failed listener settles on [] and an offline cold start can deliver an empty from-cache
// snapshot: neither is the member's real count (1.127 final review I2).
describe('isBadgeSourceLoaded', () => {
  it('is loaded for a server result of a resolved resource', () => {
    expect(isBadgeSourceLoaded('resolved', { fromCache: false, failed: false })).toBe(true);
    expect(isBadgeSourceLoaded('reloading', { fromCache: false, failed: false })).toBe(true);
  });
  it('is not loaded while loading or idle or on error', () => {
    expect(isBadgeSourceLoaded('loading', undefined)).toBe(false);
    expect(isBadgeSourceLoaded('idle', undefined)).toBe(false);
    expect(isBadgeSourceLoaded('error', undefined)).toBe(false);
  });
  it('a failed listener is not loaded', () => {
    expect(isBadgeSourceLoaded('resolved', { fromCache: false, failed: true })).toBe(false);
  });
  it('a from-cache-only result is not loaded', () => {
    expect(isBadgeSourceLoaded('resolved', { fromCache: true, failed: false })).toBe(false);
  });
});

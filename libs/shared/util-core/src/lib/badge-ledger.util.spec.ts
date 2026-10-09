import { describe, expect, it } from 'vitest';

import {
  applyBadgePush,
  BADGE_LEDGER_SEEN_MAX,
  BadgeLedger,
  badgeLedgerFromPage,
  badgeLedgerTotal,
  emptyBadgeLedger,
} from './badge-ledger.util';

const NOW = 1_000;

function pageLedger(parts: Partial<BadgeLedger> = {}): BadgeLedger {
  return { ...emptyBadgeLedger(), chat: 2, tasks: 3, invitations: 1, fromPage: true, ...parts };
}

describe('badgeLedgerFromPage', () => {
  it('replaces the parts, keeps seen and marks the ledger trustworthy', () => {
    const previous = pageLedger({ seen: ['$e1'], fromPage: false });
    const next = badgeLedgerFromPage(previous, { chat: 0, tasks: 4, invitations: 2 }, NOW);
    expect(next).toEqual({ chat: 0, tasks: 4, invitations: 2, seen: ['$e1'], fromPage: true, updatedAt: NOW });
  });

  it('starts an empty seen list without a previous ledger', () => {
    expect(badgeLedgerFromPage(undefined, { chat: 1, tasks: 0, invitations: 0 }, NOW).seen).toEqual([]);
  });
});

describe('applyBadgePush', () => {
  it('replaces the task part and keeps the others (chat no longer clobbers tasks)', () => {
    const result = applyBadgePush(pageLedger(), { badgeTasks: '5' }, NOW);
    expect(result.ledger?.tasks).toBe(5);
    expect(result.ledger?.chat).toBe(2);
    expect(result.badge).toBe(2 + 5 + 1);
  });

  it('adds one chat message and remembers its id', () => {
    const result = applyBadgePush(pageLedger(), { badgeAdd: 'chat', badgeId: '$e1' }, NOW);
    expect(result.ledger?.chat).toBe(3);
    expect(result.ledger?.seen).toEqual(['$e1']);
    expect(result.badge).toBe(3 + 3 + 1);
  });

  it('adds one invitation', () => {
    const result = applyBadgePush(pageLedger(), { badgeAdd: 'invitation', badgeId: 'inv-1' }, NOW);
    expect(result.ledger?.invitations).toBe(2);
  });

  it('counts a duplicate delivery only once', () => {
    const once = applyBadgePush(pageLedger(), { badgeAdd: 'chat', badgeId: '$e1' }, NOW).ledger;
    const twice = applyBadgePush(once, { badgeAdd: 'chat', badgeId: '$e1' }, NOW);
    expect(twice.ledger).toBeUndefined();
    expect(twice.badge).toBe(badgeLedgerTotal(once as BadgeLedger));
  });

  it('ignores badgeAdd without an id or with an unknown kind', () => {
    expect(applyBadgePush(pageLedger(), { badgeAdd: 'chat' }, NOW).ledger).toBeUndefined();
    expect(applyBadgePush(pageLedger(), { badgeAdd: 'task', badgeId: 'x' }, NOW).ledger).toBeUndefined();
  });

  it('caps the seen list', () => {
    const seen = Array.from({ length: BADGE_LEDGER_SEEN_MAX }, (_, i) => `id-${i}`);
    const result = applyBadgePush(pageLedger({ seen }), { badgeAdd: 'chat', badgeId: 'new' }, NOW);
    expect(result.ledger?.seen).toHaveLength(BADGE_LEDGER_SEEN_MAX);
    expect(result.ledger?.seen[BADGE_LEDGER_SEEN_MAX - 1]).toBe('new');
    expect(result.ledger?.seen[0]).toBe('id-1');
  });

  it('replaces the chat part from a badge-sync push and can reach zero (no floor)', () => {
    const result = applyBadgePush(pageLedger({ tasks: 0, invitations: 0 }), { badgeChat: '0' }, NOW);
    expect(result.ledger?.chat).toBe(0);
    expect(result.badge).toBe(0);
  });

  it('re-applies the stored sum for a push without badge fields', () => {
    const result = applyBadgePush(pageLedger(), {}, NOW);
    expect(result.ledger).toBeUndefined();
    expect(result.badge).toBe(6);
  });

  it('leaves the badge alone while the page has never written the ledger', () => {
    expect(applyBadgePush(undefined, {}, NOW).badge).toBeUndefined();
    const tasks = applyBadgePush(undefined, { badgeTasks: '2' }, NOW);
    expect(tasks.ledger).toMatchObject({ tasks: 2, fromPage: false });
    expect(tasks.badge).toBeUndefined();
    const chat = applyBadgePush(tasks.ledger, { badgeAdd: 'chat', badgeId: '$e1' }, NOW);
    expect(chat.ledger).toMatchObject({ tasks: 2, chat: 1, fromPage: false });
    expect(chat.badge).toBeUndefined();
  });

  it('treats garbage counts as absent and clamps negatives', () => {
    expect(applyBadgePush(pageLedger(), { badgeTasks: 'abc' }, NOW).ledger).toBeUndefined();
    expect(applyBadgePush(pageLedger(), { badgeTasks: '-3' }, NOW).ledger?.tasks).toBe(0);
  });
});

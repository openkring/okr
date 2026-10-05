import { describe, expect, it } from 'vitest';

import { closedRoomIntruders, needsClosedRoomCleanup } from './chat-mode-sync';

const room = '!abc:bkchat.etke.host';

describe('needsClosedRoomCleanup', () => {
  it('fires when a group switches to members-only', () => {
    expect(needsClosedRoomCleanup({ chatMode: 'shared', matrixRoomId: room }, { chatMode: 'members', matrixRoomId: room })).toBe(true);
    expect(needsClosedRoomCleanup({ matrixRoomId: room }, { chatMode: 'members', matrixRoomId: room })).toBe(true);
  });

  it('fires when an admin is removed from a members-only group', () => {
    const before = { chatMode: 'members', matrixRoomId: room, admins: [{ key: 'A' }, { key: 'kaiser' }] };
    const after = { chatMode: 'members', matrixRoomId: room, admins: [{ key: 'A' }] };
    expect(needsClosedRoomCleanup(before, after)).toBe(true);
  });

  it('ignores unrelated writes and admin re-ordering', () => {
    const before = { chatMode: 'members', matrixRoomId: room, admins: [{ key: 'A' }, { key: 'B' }] };
    const after = { chatMode: 'members', matrixRoomId: room, admins: [{ key: 'b' }, { key: 'a' }] };
    expect(needsClosedRoomCleanup(before, after)).toBe(false);
  });

  it('never touches shared/ask groups, creations, deletions or room-less groups', () => {
    expect(needsClosedRoomCleanup({ chatMode: 'members', matrixRoomId: room }, { chatMode: 'shared', matrixRoomId: room })).toBe(false);
    expect(needsClosedRoomCleanup(undefined, { chatMode: 'members', matrixRoomId: room })).toBe(false);
    expect(needsClosedRoomCleanup({ chatMode: 'members', matrixRoomId: room }, undefined)).toBe(false);
    expect(needsClosedRoomCleanup({ chatMode: 'shared' }, { chatMode: 'members', matrixRoomId: ' ' })).toBe(false);
  });
});

describe('closedRoomIntruders', () => {
  it('reports joined users who are neither member, admin nor service account', () => {
    // the 2026-10-05 «4x Mittwoch» case: @kaiser sat in the room without a membership
    const roomMembers = ['a90orkkkzf5lnfj81zkt', 'x5evmgmvv0dce8v2dsfk', 'bk2-bot', 'kaiser', 'bruno'];
    expect(closedRoomIntruders(roomMembers, ['X5evmGmVV0DcE8v2dsfk'], ['A90ORkKKzF5LNfJ81zKt'])).toEqual(['kaiser']);
  });

  it('returns nothing for a room that mirrors its member list', () => {
    expect(closedRoomIntruders(['m1', 'bk2-bot'], ['M1'], [])).toEqual([]);
  });
});

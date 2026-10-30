import { describe, expect, it } from 'vitest';
import { admitsUnmarkedRoom, TenantRoomScope } from './room-admission';

// Mirrors describe('filterRoomsOfTenant') in libs/chat/util/src/lib/chat.util.spec.ts (unmarked cases).
describe('admitsUnmarkedRoom', () => {
  const scope: TenantRoomScope = {
    groupRoomIds: new Set(['!g:hs']),
    groupAliasLocalparts: new Set(['group_rowing', 'group_p13_board']),
    personKeys: new Set(['kaiser', 'anna']),
    serverName: 'hs',
  };

  it('hides a room of another homeserver', () => {
    expect(admitsUnmarkedRoom({ roomId: '!x:other' }, scope)).toBe(false);
    expect(admitsUnmarkedRoom({ roomId: '!news:etke.cc', canonicalAlias: '#news:etke.cc' }, scope)).toBe(false);
  });
  it('admits a group room by room id', () => {
    expect(admitsUnmarkedRoom({ roomId: '!g:hs', canonicalAlias: '#group_old:hs' }, scope)).toBe(true);
  });
  it('admits a group room by alias, case-insensitive (legacy mixed-case)', () => {
    expect(admitsUnmarkedRoom({ roomId: '!y:hs', canonicalAlias: '#group_Rowing:hs' }, scope)).toBe(true);
    expect(admitsUnmarkedRoom({ roomId: '!b:hs', canonicalAlias: '#group_P13_Board:hs' }, scope)).toBe(true);
  });
  it('hides another tenant\'s group room', () => {
    expect(admitsUnmarkedRoom({ roomId: '!z:hs', canonicalAlias: '#group_other:hs' }, scope)).toBe(false);
  });
  it('hides every group room when the tenant has no groups', () => {
    const empty = { ...scope, groupRoomIds: new Set<string>(), groupAliasLocalparts: new Set<string>() };
    expect(admitsUnmarkedRoom({ roomId: '!y:hs', canonicalAlias: '#group_rowing:hs' }, empty)).toBe(false);
  });
  it('admits a DM with a member of the tenant, hides one with a stranger', () => {
    expect(admitsUnmarkedRoom({ roomId: '!d:hs', directCounterpart: '@kaiser:hs' }, scope)).toBe(true);
    expect(admitsUnmarkedRoom({ roomId: '!d:hs', directCounterpart: '@Anna:hs' }, scope)).toBe(true);
    expect(admitsUnmarkedRoom({ roomId: '!d:hs', directCounterpart: '@stranger:hs' }, scope)).toBe(false);
  });
  it('admits a bridged DM (ghost counterpart)', () => {
    expect(admitsUnmarkedRoom({ roomId: '!d:hs', directCounterpart: '@signal_123:hs' }, scope)).toBe(true);
    expect(admitsUnmarkedRoom({ roomId: '!r:hs', creator: '@signalbot:hs', directCounterpart: '@signal_9f3a:hs' }, scope)).toBe(true);
  });
  it('hides a room created by a bridge bot', () => {
    expect(admitsUnmarkedRoom({ roomId: '!b:hs', creator: '@signalbot:hs' }, scope)).toBe(false);
    expect(admitsUnmarkedRoom({ roomId: '!b:hs', creator: '@whatsappbot:hs' }, scope)).toBe(false);
  });
  it('admits an ad-hoc room, also one created by a person', () => {
    expect(admitsUnmarkedRoom({ roomId: '!a:hs' }, scope)).toBe(true);
    expect(admitsUnmarkedRoom({ roomId: '!q:hs', creator: '@bruno:hs' }, scope)).toBe(true);
  });
  it('skips the homeserver rule without a server name', () => {
    expect(admitsUnmarkedRoom({ roomId: '!x:other' }, { ...scope, serverName: '' })).toBe(true);
  });
});

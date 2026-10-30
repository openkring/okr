import { describe, expect, it } from 'vitest';
import { admitsUnmarkedRoom, decideAdmission, TenantRoomScope } from './room-admission';

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

describe('decideAdmission', () => {
  const scope: TenantRoomScope = {
    groupRoomIds: new Set(), groupAliasLocalparts: new Set(), personKeys: new Set(['kaiser']), serverName: 'hs',
  };
  const foreignDm = { roomId: '!dm:hs', directCounterpart: '@stranger:hs' };

  it('follows the marker when the room carries one (pusherAdmitsRoom)', () => {
    expect(decideAdmission(['scs'], 'scs', foreignDm, scope)).toBe(true);
    expect(decideAdmission(['scs'], 'kring', undefined, undefined)).toBe(false);
    expect(decideAdmission([], 'scs', undefined, undefined)).toBe(false);
  });
  it('delivers an unmarked room to a pusher without tenant', () => {
    expect(decideAdmission(undefined, undefined, foreignDm, scope)).toBe(true);
    expect(decideAdmission(undefined, '', foreignDm, scope)).toBe(true);
  });
  // Review Focus 2: Synapse admin API down or slow -> no facts -> delivered, as before.
  it('fails open when the room facts could not be read', () => {
    expect(decideAdmission(undefined, 'scs', undefined, scope)).toBe(true);
  });
  it('fails open when the tenant scope could not be read', () => {
    expect(decideAdmission(undefined, 'scs', foreignDm, undefined)).toBe(true);
  });
  it('applies admitsUnmarkedRoom to an unmarked room with facts and scope', () => {
    expect(decideAdmission(undefined, 'scs', foreignDm, scope)).toBe(false);
    expect(decideAdmission(undefined, 'scs', { roomId: '!dm:hs', directCounterpart: '@kaiser:hs' }, scope)).toBe(true);
  });
});

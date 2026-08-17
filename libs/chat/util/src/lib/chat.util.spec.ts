import { describe, it, expect } from 'vitest';
import { buildReceiptAriaLabel, filterRoomsOfTenant, findSupportRoom, isBridgeGhost, hashUserIdToColor, formatReceiptTime, resolveMatrixDisplayName } from './chat.util';

describe('buildReceiptAriaLabel', () => {
  it('returns empty string for no receipts', () => {
    expect(buildReceiptAriaLabel([])).toBe('');
  });

  it('returns single name for one receipt', () => {
    expect(buildReceiptAriaLabel([{ displayName: 'Alice' }])).toBe('Gelesen von Alice');
  });

  it('returns two names for two receipts', () => {
    expect(buildReceiptAriaLabel([
      { displayName: 'Alice' },
      { displayName: 'Bob' },
    ])).toBe('Gelesen von Alice, Bob');
  });

  it('returns overflow notation for three or more receipts', () => {
    expect(buildReceiptAriaLabel([
      { displayName: 'Alice' },
      { displayName: 'Bob' },
      { displayName: 'Carol' },
    ])).toBe('Gelesen von Alice, Bob (+1 weitere)');
  });

  it('counts overflow correctly for five receipts', () => {
    const receipts = ['Alice','Bob','Carol','Dave','Eve'].map(n => ({ displayName: n }));
    expect(buildReceiptAriaLabel(receipts)).toBe('Gelesen von Alice, Bob (+3 weitere)');
  });
});

describe('hashUserIdToColor', () => {
  it('returns a hex color string', () => {
    expect(hashUserIdToColor('@alice:example.org')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns a consistent color for the same userId', () => {
    const userId = '@alice:example.org';
    expect(hashUserIdToColor(userId)).toBe(hashUserIdToColor(userId));
  });

  it('returns a value from the fixed palette (one of 8 colors)', () => {
    const COLORS = ['#e57373','#f06292','#ba68c8','#7986cb','#4fc3f7','#4db6ac','#81c784','#ffb74d'];
    expect(COLORS).toContain(hashUserIdToColor('@alice:example.org'));
  });
});

describe('formatReceiptTime', () => {
  it('includes "Gelesen" prefix', () => {
    expect(formatReceiptTime(1700000000000)).toContain('Gelesen');
  });

  it('includes HH:mm time pattern', () => {
    expect(formatReceiptTime(1700000000000)).toMatch(/\d{2}:\d{2}/);
  });
});

describe('resolveMatrixDisplayName', () => {
  it('returns the raw display name when set', () => {
    expect(resolveMatrixDisplayName('Alice Meier', '@p123abc:bkchat.etke.host')).toBe('Alice Meier');
  });

  it('falls back to the localpart when the display name is null', () => {
    expect(resolveMatrixDisplayName(null, '@p123abc:bkchat.etke.host')).toBe('p123abc');
  });

  it('falls back to the localpart when the display name is empty', () => {
    expect(resolveMatrixDisplayName('', '@p123abc:bkchat.etke.host')).toBe('p123abc');
  });

  it('falls back to the localpart when the display name is undefined', () => {
    expect(resolveMatrixDisplayName(undefined, '@p123abc:bkchat.etke.host')).toBe('p123abc');
  });

  it('never returns the full Matrix user id', () => {
    expect(resolveMatrixDisplayName(null, '@p123abc:bkchat.etke.host')).not.toContain(':');
  });
});

describe('filterRoomsOfTenant', () => {
  const rooms = [
    { roomId: '!a:hs', topic: '#group_trainerteam:hs' },       // other tenant's group (unmarked)
    { roomId: '!b:hs', topic: '#group_P13_Board:hs' },         // legacy mixed-case alias -> still matches
    { roomId: '!c:hs', topic: '#group_whatever:hs' },          // matched via matrixRoomId
    { roomId: '!d:hs', directUserId: '@Anna:hs' },             // DM with a person of this tenant
    { roomId: '!e:hs', directUserId: '@zoe:hs' },              // DM with someone from another tenant
    { roomId: '!j:hs', directUserId: '@signal_9f3a-uuid:hs' }, // bridged DM: ghost is no person -> kept
    { roomId: '!f:hs' },                                        // ad-hoc, unclassifiable -> kept
    { roomId: '!g:hs', tenants: ['p13'] },                      // marked: this tenant
    { roomId: '!h:hs', tenants: ['scs'] },                      // marked: other tenant
    { roomId: '!i:hs', topic: '#group_p13_board:hs', tenants: ['scs'] }, // marker wins over alias
  ];
  const groups = [{ okey: 'p13 board' }, { okey: 'other', matrixRoomId: '!c:hs' }];
  const personKeys = new Set(['anna', 'bruno']);

  it('keeps this tenant’s marked, group and DM rooms plus unclassifiable ones', () => {
    expect(filterRoomsOfTenant(rooms, groups, personKeys, 'p13').map(r => r.roomId))
      .toEqual(['!b:hs', '!c:hs', '!d:hs', '!j:hs', '!f:hs', '!g:hs']);
  });

  it('hides every unmarked group room when the tenant has no groups', () => {
    expect(filterRoomsOfTenant(rooms, [], personKeys, 'p13').map(r => r.roomId))
      .toEqual(['!d:hs', '!j:hs', '!f:hs', '!g:hs']);
  });
});

describe('isBridgeGhost', () => {
  it('recognises mautrix puppet localparts, not ordinary person keys', () => {
    expect(isBridgeGhost('signal_9f3a-uuid')).toBe(true);
    expect(isBridgeGhost('whatsapp_41791234567')).toBe(true);
    expect(isBridgeGhost('anna')).toBe(false);
    expect(isBridgeGhost('bk2-bot')).toBe(false);
  });
});

describe('findSupportRoom', () => {
  const room = (roomId: string, name?: string, topic?: string) => ({ roomId, name, topic });

  it('matches the canonical alias, not the display name', () => {
    const rooms = [room('!a', 'Support'), room('!b', 'Hilfe & Fragen', '#support:okr.ch')];
    expect(findSupportRoom(rooms, 'scs')?.roomId).toBe('!b');
  });

  it('accepts the group_support alias', () => {
    expect(findSupportRoom([room('!a', 'x', '#group_support:okr.ch')], 'scs')?.roomId).toBe('!a');
  });

  it('matches the tenant-prefixed group alias', () => {
    expect(findSupportRoom([room('!a', 'x', '#group_scs_support:okr.ch')], 'scs')?.roomId).toBe('!a');
  });

  it('ignores another tenant’s prefixed support room', () => {
    expect(findSupportRoom([room('!a', 'x', '#group_p13_support:okr.ch')], 'scs')).toBeUndefined();
  });

  it('falls back to the name for a room without an alias', () => {
    expect(findSupportRoom([room('!a', 'support')], 'scs')?.roomId).toBe('!a');
  });

  it('ignores a room named support that carries a different alias', () => {
    expect(findSupportRoom([room('!a', 'support', '#trainer:okr.ch')], 'scs')).toBeUndefined();
  });

  it('returns undefined when there is no support room', () => {
    expect(findSupportRoom([room('!a', 'Trainer')], 'scs')).toBeUndefined();
  });
});

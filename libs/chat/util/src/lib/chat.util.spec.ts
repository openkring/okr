import { describe, it, expect } from 'vitest';
import { buildReceiptAriaLabel, filterRoomsOfTenant, isRoomClassifiable, findSupportRoom, isBridgeGhost, hashUserIdToColor, formatReceiptTime, isRenderableChatEvent, linkifyText, resolveMatrixDisplayName, canPostWithPower, groupRoomAliasLocalpart, groupKeyFromRoomAlias, isRoomGoneError, askRoomAliasLocalpart, shouldDeferAskRoom } from './chat.util';

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

  it('holds back a room whose state has not synced yet instead of showing it everywhere', () => {
    // Mid-initial-sync entry: no marker, no alias, no directUserId — another tenant's group room
    // is indistinguishable from an ad-hoc one, so it must not fall through to the "keep" rule.
    const pending = [{ roomId: '!k:hs', stateLoaded: false }];
    expect(filterRoomsOfTenant(pending, groups, personKeys, 'p13')).toEqual([]);
    expect(filterRoomsOfTenant(pending, groups, personKeys, 'scs')).toEqual([]);
  });

  it('keeps a not-yet-synced room that already carries this tenant’s marker', () => {
    // The pending-room stub: no alias and no state, but the app knows which tenant joined it.
    const stub = [{ roomId: '!l:hs', tenants: ['p13'], stateLoaded: false }];
    expect(filterRoomsOfTenant(stub, groups, personKeys, 'p13').map(r => r.roomId)).toEqual(['!l:hs']);
    expect(filterRoomsOfTenant(stub, groups, personKeys, 'scs')).toEqual([]);
  });

  it('treats an absent stateLoaded flag as loaded, keeping the historic fallback', () => {
    expect(filterRoomsOfTenant([{ roomId: '!m:hs' }], groups, personKeys, 'p13').map(r => r.roomId))
      .toEqual(['!m:hs']);
  });
});

describe('isRoomClassifiable', () => {
  const base = {
    hasCreateEvent: true, syncPrepared: false, hasTenantMarker: false,
    hasAlias: false, hasRoomName: false, hasDirectUserId: false,
  };

  it('holds back a DM whose counterpart has not resolved during the initial sync', () => {
    // The leak: m.direct account data and the member state both land after the room-state
    // events that already rebuilt the list, so this shape is a DM that cannot be placed yet.
    // Reported as stateLoaded:true it falls through to filterRoomsOfTenant's "keep" rule and
    // shows another tenant's 1:1 chat for a few seconds after login.
    expect(isRoomClassifiable(base)).toBe(false);
  });

  it('emits a room that identifies itself even before the sync is prepared', () => {
    expect(isRoomClassifiable({ ...base, hasTenantMarker: true })).toBe(true);
    expect(isRoomClassifiable({ ...base, hasAlias: true })).toBe(true);
    expect(isRoomClassifiable({ ...base, hasRoomName: true })).toBe(true);
    expect(isRoomClassifiable({ ...base, hasDirectUserId: true })).toBe(true);
  });

  it('keeps a genuinely unclassifiable room once the sync is prepared', () => {
    // Ad-hoc room, or a DM whose counterpart never resolves: hiding it would lose a
    // conversation, so the historic "keep" behaviour must come back at PREPARED.
    expect(isRoomClassifiable({ ...base, syncPrepared: true })).toBe(true);
  });

  it('never reports a room whose state has not arrived at all', () => {
    expect(isRoomClassifiable({ ...base, hasCreateEvent: false, syncPrepared: true })).toBe(false);
    expect(isRoomClassifiable({ ...base, hasCreateEvent: false, hasTenantMarker: true })).toBe(false);
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

describe('linkifyText', () => {
  it('wraps a url in an anchor', () => {
    expect(linkifyText('see https://a.ch/x?y=1 now'))
      .toBe('see <a href="https://a.ch/x?y=1" target="_blank" rel="noopener noreferrer">https://a.ch/x?y=1</a> now');
  });

  it('escapes markup and leaves plain text alone', () => {
    expect(linkifyText('a <b> "c"')).toBe('a &lt;b&gt; &quot;c&quot;');
  });

  it('does not swallow trailing punctuation', () => {
    expect(linkifyText('go to https://a.ch.')).toContain('>https://a.ch</a>.');
  });
});

describe('isRenderableChatEvent', () => {
  it('renders a plain message', () => {
    expect(isRenderableChatEvent('m.room.message')).toBe(true);
  });

  it('renders a poll start', () => {
    expect(isRenderableChatEvent('org.matrix.msc3381.poll.start')).toBe(true);
  });

  it('drops an edit event (applied to the original bubble instead)', () => {
    expect(isRenderableChatEvent('m.room.message', { rel_type: 'm.replace', event_id: '$a' })).toBe(false);
  });

  it('keeps a reply, which relates but is its own bubble', () => {
    expect(isRenderableChatEvent('m.room.message', { rel_type: 'm.thread', event_id: '$a' })).toBe(true);
  });

  it('drops the state events that dominate a group room', () => {
    for (const t of ['m.room.member', 'm.room.power_levels', 'm.reaction', 'm.room.redaction', 'org.okr.tenant']) {
      expect(isRenderableChatEvent(t)).toBe(false);
    }
  });
});

describe('canPostWithPower', () => {
  it('allows posting in an ordinary room where nothing is required', () => {
    expect(canPostWithPower(0, 0)).toBe(true);
  });

  it('blocks a member below the required level', () => {
    expect(canPostWithPower(0, 50)).toBe(false);
  });

  it('allows a privileged member at exactly the required level', () => {
    expect(canPostWithPower(50, 50)).toBe(true);
  });

  it('allows an admin above it', () => {
    expect(canPostWithPower(100, 50)).toBe(true);
  });

  it('defaults to open while the room state has not arrived yet', () => {
    // Waehrend der Erstsynchronisation ist beides undefined. Der Composer darf dann NICHT
    // gesperrt wirken — Synapse weist eine unerlaubte Nachricht ohnehin ab, ein faelschlich
    // gesperrtes Eingabefeld sieht dagegen wie ein Defekt aus.
    expect(canPostWithPower(undefined, undefined)).toBe(true);
  });

  it('treats a missing own power as 0 once a requirement is known', () => {
    expect(canPostWithPower(undefined, 50)).toBe(false);
  });
});

describe('groupRoomAliasLocalpart', () => {
  it('passes a normalised group key through unchanged', () => {
    expect(groupRoomAliasLocalpart('scs_notfall')).toBe('group_scs_notfall');
  });

  it('lowercases a legacy mixed-case key', () => {
    expect(groupRoomAliasLocalpart('Trainerteam')).toBe('group_trainerteam');
  });

  it('replaces every character an alias may not carry', () => {
    // Der Grund, warum Anzeigename und Alias zwei verschiedene Strings sind.
    expect(groupRoomAliasLocalpart('Kandidat:innen & Instrukt.')).toBe('group_kandidat_innen___instrukt.');
  });
});

describe('groupKeyFromRoomAlias', () => {
  it('extracts the group key from a canonical alias', () => {
    expect(groupKeyFromRoomAlias('#group_scs_notfall:bkchat.etke.host')).toBe('scs_notfall');
  });

  it('lowercases a legacy mixed-case alias', () => {
    expect(groupKeyFromRoomAlias('#group_Trainerteam:bkchat.etke.host')).toBe('trainerteam');
  });

  it('returns undefined for an ask room, a DM or no alias at all', () => {
    expect(groupKeyFromRoomAlias('#ask_notfall_kaiser:bkchat.etke.host')).toBeUndefined();
    expect(groupKeyFromRoomAlias(undefined)).toBeUndefined();
  });

  it('round-trips with groupRoomAliasLocalpart for normalised keys', () => {
    expect(groupKeyFromRoomAlias(`#${groupRoomAliasLocalpart('scs_kandidatinnenin')}:bkchat.etke.host`))
      .toBe('scs_kandidatinnenin');
  });
});

describe('isRoomGoneError', () => {
  it('recognises the Synapse 403 for a room the user is not in (purged room in the local store)', () => {
    expect(isRoomGoneError({ errcode: 'M_FORBIDDEN', message: 'MatrixError: [403] User @x:hs not in room !abc, and room previews are disabled' })).toBe(true);
  });

  it('recognises M_NOT_FOUND', () => {
    expect(isRoomGoneError({ errcode: 'M_NOT_FOUND', message: 'Room not found' })).toBe(true);
  });

  it('does not treat other 403s (e.g. missing power) as a gone room', () => {
    expect(isRoomGoneError({ errcode: 'M_FORBIDDEN', message: 'You don\'t have permission to view history' })).toBe(false);
  });

  it('does not treat network errors as a gone room', () => {
    expect(isRoomGoneError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isRoomGoneError({ errcode: 'M_LIMIT_EXCEEDED', message: 'Too many requests' })).toBe(false);
    expect(isRoomGoneError(null)).toBe(false);
    expect(isRoomGoneError(undefined)).toBe(false);
  });
});

describe('askRoomAliasLocalpart', () => {
  it('mirrors the Cloud Function derivation', () => {
    expect(askRoomAliasLocalpart('scs_vorstand', 'kaiser')).toBe('ask_scs_vorstand_kaiser');
  });

  it('sanitises a legacy group key that contains spaces and capitals', () => {
    // groups/'Ausschuss Boote' is a real pre-2026-08 key — the alias it produced is
    // #ask_ausschuss_boote_<person>, so the client must sanitise identically or it will
    // never recognise the room it already joined.
    expect(askRoomAliasLocalpart('Ausschuss Boote', 'ABC123')).toBe('ask_ausschuss_boote_abc123');
  });
});

describe('shouldDeferAskRoom', () => {
  const me = 'jhmzsqs0oxxpjbfc0aiu';
  const askGroup = { okey: 'support', chatMode: 'ask' as const };
  const myRoom = { canonicalAlias: `#ask_support_${me}:bkchat.etke.host` };

  it('defers for an ask group the person has no room in', () => {
    expect(shouldDeferAskRoom(askGroup, [], me)).toBe(true);
  });

  it('does NOT defer once the person has their own ask room', () => {
    expect(shouldDeferAskRoom(askGroup, [myRoom], me)).toBe(false);
  });

  it('does NOT defer because SOMEONE ELSE has an ask room in the group', () => {
    // A group member sees every requester's room. Matching the prefix alone would make
    // the member's own first message skip creation and post into a stranger's room.
    const othersRoom = { canonicalAlias: '#ask_support_someoneelse:bkchat.etke.host' };
    expect(shouldDeferAskRoom(askGroup, [othersRoom], me)).toBe(true);
  });

  it('never defers for a shared group', () => {
    // Opening a shared group joins an EXISTING room — nothing is created, so there is
    // nothing to defer, and deferring would hide the group's history.
    expect(shouldDeferAskRoom({ okey: 'scs', chatMode: 'shared' }, [], me)).toBe(false);
  });

  it('never defers for a members-only group', () => {
    // The CF refuses a non-member outright; a member lands in the shared room.
    expect(shouldDeferAskRoom({ okey: 'notfall', chatMode: 'members' }, [], me)).toBe(false);
  });

  it('treats a missing chatMode as shared (the model default)', () => {
    expect(shouldDeferAskRoom({ okey: 'scs' }, [], me)).toBe(false);
  });

  it('falls back to today behaviour when the group is unknown to the client', () => {
    // The group doc may not be loaded, or belong to another tenant. Never defer on a guess:
    // the worst case then is one empty room, exactly as before this change.
    expect(shouldDeferAskRoom(undefined, [], me)).toBe(false);
  });

  it('does not defer without a personKey', () => {
    expect(shouldDeferAskRoom(askGroup, [], '')).toBe(false);
  });

  it('matches the alias case-insensitively', () => {
    const upper = { canonicalAlias: `#ASK_SUPPORT_${me.toUpperCase()}:bkchat.etke.host` };
    expect(shouldDeferAskRoom(askGroup, [upper], me)).toBe(false);
  });

  it('ignores rooms with no canonical alias', () => {
    expect(shouldDeferAskRoom(askGroup, [{ canonicalAlias: undefined }], me)).toBe(true);
  });
});

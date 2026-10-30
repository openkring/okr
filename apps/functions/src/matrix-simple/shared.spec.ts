import { describe, expect, it } from 'vitest';

import {
  askRoomAliasLocalpart,
  askRoomsToLeave,
  BoundedTtlCache,
  chatDeepLink,
  directCounterpartOf,
  groupKeyFromRoomAlias,
  groupRoomAliasLocalpart,
  isProtectedRoomAlias,
  markerFromRoomState,
  mayPinForAll,
  muteBlocksPush,
  needsScopeRefresh,
  nextAdhocAdmin,
  pusherAdmitsRoom,
  roomAdmitsTenant,
  serverNameOf,
  useAskRoom,
} from './shared';
import type { TenantRoomScope } from './room-admission';

describe('askRoomAliasLocalpart', () => {
  it('derives a stable localpart from group + person', () => {
    expect(askRoomAliasLocalpart('scs_vorstand', 'kaiser')).toBe('ask_scs_vorstand_kaiser');
  });

  it('lowercases and sanitises both parts (Matrix allows only [a-z0-9._~-])', () => {
    expect(askRoomAliasLocalpart('Trainerteam', 'Müller Meier')).toBe('ask_trainerteam_m_ller_meier');
  });

  it('never collides with a group room alias', () => {
    expect(askRoomAliasLocalpart('support', 'x')).not.toBe(groupRoomAliasLocalpart('support'));
  });

  it('sanitises a group key that contains spaces', () => {
    expect(askRoomAliasLocalpart('Ausschuss Boote', 'kaiser')).toBe('ask_ausschuss_boote_kaiser');
  });
});

describe('roomAdmitsTenant', () => {
  it('admits a caller whose tenant is on the marker', () => {
    expect(roomAdmitsTenant(['scs'], ['scs'])).toBe(true);
  });

  it('refuses a caller from another tenant', () => {
    // The hole this closed: Synapse's admin API is homeserver-global and every callable
    // holds the one @bk2-bot token, so an elab admin could list, rename and DELETE scs rooms.
    expect(roomAdmitsTenant(['scs'], ['elab'])).toBe(false);
  });

  it('admits a room shared by several tenants', () => {
    expect(roomAdmitsTenant(['scs', 'kring'], ['kring'])).toBe(true);
  });

  it('refuses a caller with no tenants at all', () => {
    expect(roomAdmitsTenant(['scs'], [])).toBe(false);
  });

  it('admits an UNMARKED room deliberately — it is already visible in every tenant', () => {
    // filterRoomsOfTenant keeps unmarked rooms everywhere ("else keep"), so refusing here
    // would cost the admin the ability to repair the room without costing anyone exposure.
    // backfillMatrixRoomTenants is the fix; callers log a warning.
    expect(roomAdmitsTenant([], ['elab'])).toBe(true);
    expect(roomAdmitsTenant([], [])).toBe(true);
  });
});

describe('useAskRoom', () => {
  it('is false for a shared group, member or not', () => {
    expect(useAskRoom('shared', [], 'kaiser')).toBe(false);
    expect(useAskRoom(undefined, [], 'kaiser')).toBe(false);
  });

  it('is true for an ask group when the person is not a member', () => {
    expect(useAskRoom('ask', ['muster'], 'kaiser')).toBe(true);
  });

  it('is false for an ask group when the person IS a member — members share one room', () => {
    expect(useAskRoom('ask', ['Kaiser'], 'kaiser')).toBe(false);
  });

  it('compares case-insensitively, like the Matrix localpart', () => {
    expect(useAskRoom('ask', ['KAISER'], 'KaIsEr')).toBe(false);
  });
});

describe('askRoomsToLeave', () => {
  const rooms = [
    { room_id: '!bjoern', canonical_alias: '#ask_notfall_bjoern:bkchat.etke.host' },
    { room_id: '!alenka', canonical_alias: '#ask_notfall_alenka:bkchat.etke.host' },
    { room_id: '!dieter', canonical_alias: '#ask_notfall_dieter:bkchat.etke.host' },
  ];

  it('returns every ask room of the group', () => {
    expect(askRoomsToLeave(rooms, 'notfall', 'kaiser')).toEqual(['!bjoern', '!alenka', '!dieter']);
  });

  it('keeps the leaver in their OWN ask room', () => {
    // The room is that person's channel to the group, not a membership perk: losing the
    // membership must not silently delete a conversation they started.
    expect(askRoomsToLeave(rooms, 'notfall', 'dieter')).toEqual(['!bjoern', '!alenka']);
  });

  it('matches the person case-insensitively (aliases are lowercased, personKeys are not)', () => {
    expect(askRoomsToLeave(rooms, 'notfall', 'Dieter')).toEqual(['!bjoern', '!alenka']);
  });

  it('never matches another group whose key merely shares a prefix', () => {
    // 'ask_notfall_' vs 'ask_notfall_intern_' — the trailing underscore is what separates them,
    // so the person key of one group can never be read as a sub-key of another.
    const mixed = [
      { room_id: '!a', canonical_alias: '#ask_notfall_x:bkchat.etke.host' },
      { room_id: '!b', canonical_alias: '#ask_notfall_intern_x:bkchat.etke.host' },
    ];
    expect(askRoomsToLeave(mixed, 'notfall_intern', 'kaiser')).toEqual(['!b']);
  });

  it('ignores group rooms and alias-less rooms', () => {
    const mixed = [
      { room_id: '!shared', canonical_alias: '#group_notfall:bkchat.etke.host' },
      { room_id: '!nameless', canonical_alias: null },
      { room_id: '!ask', canonical_alias: '#ask_notfall_x:bkchat.etke.host' },
    ];
    expect(askRoomsToLeave(mixed, 'notfall', 'kaiser')).toEqual(['!ask']);
  });
});

describe('markerFromRoomState', () => {
  const marker = (content: unknown, state_key = '') => ({ type: 'org.okr.tenant', state_key, content });

  it('reads the tenants of the marker event', () => {
    expect(markerFromRoomState([{ type: 'm.room.create', state_key: '', content: {} }, marker({ tenants: ['elab'] })]))
      .toEqual(['elab']);
  });

  it('keeps a deliberately empty marker apart from an absent one', () => {
    expect(markerFromRoomState([marker({ tenants: [] })])).toEqual([]);
    expect(markerFromRoomState([{ type: 'm.room.name', state_key: '', content: { name: 'x' } }])).toBeUndefined();
  });

  it('ignores a marker under another state key or with malformed content', () => {
    expect(markerFromRoomState([marker({ tenants: ['scs'] }, 'other')])).toBeUndefined();
    expect(markerFromRoomState([marker({ tenants: 'scs' })])).toBeUndefined();
    expect(markerFromRoomState(undefined)).toBeUndefined();
  });
});

describe('pusherAdmitsRoom', () => {
  it('delivers to the apps of the tenants on the marker only', () => {
    expect(pusherAdmitsRoom(['scs'], 'scs')).toBe(true);
    expect(pusherAdmitsRoom(['scs', 'kring'], 'kring')).toBe(true);
    expect(pusherAdmitsRoom(['scs'], 'kwa')).toBe(false);
  });

  it('delivers to nobody when the marker is deliberately empty', () => {
    expect(pusherAdmitsRoom([], 'scs')).toBe(false);
  });

  it('delivers as before for an unmarked room or a failed marker read', () => {
    expect(pusherAdmitsRoom(undefined, 'scs')).toBe(true);
  });

  it('delivers as before to a pusher registered without a tenant', () => {
    expect(pusherAdmitsRoom(['scs'], undefined)).toBe(true);
    expect(pusherAdmitsRoom(['scs'], '')).toBe(true);
  });
});

describe('mayPinForAll', () => {
  it('lets every member of an ad-hoc chat pin for all', () => {
    expect(mayPinForAll('adhoc', {}, false)).toBe(true);
  });

  it('requires a group admin or privileged/admin role in group rooms and pinboards', () => {
    expect(mayPinForAll('group', {}, false)).toBe(false);
    expect(mayPinForAll('group', { privileged: true }, false)).toBe(true);
    expect(mayPinForAll('group', { admin: true }, false)).toBe(true);
    expect(mayPinForAll('pinboard', {}, true)).toBe(true);
    expect(mayPinForAll('pinboard', { registered: true }, false)).toBe(false);
  });

  it('never in the notes room or an unknown room', () => {
    expect(mayPinForAll('notes', { admin: true }, true)).toBe(false);
    expect(mayPinForAll('other', { admin: true }, true)).toBe(false);
  });
});

describe('isProtectedRoomAlias', () => {
  it('matches the support and Notfall aliases of the tenant', () => {
    for (const a of ['group_scs_support', 'support', 'group_support', 'group_scs_notfall', 'notfall']) {
      expect(isProtectedRoomAlias(a, 'scs')).toBe(true);
    }
  });

  it('does not match another tenant\'s support room or an ordinary group', () => {
    expect(isProtectedRoomAlias('group_kring_support', 'scs')).toBe(false);
    expect(isProtectedRoomAlias('group_scs_vorstand', 'scs')).toBe(false);
  });
});

describe('muteBlocksPush', () => {
  const NOW = 1_000_000;

  it('blocks while a room mute is active, indefinitely with null', () => {
    expect(muteBlocksPush({ rooms: { '!r': { until: NOW + 1 } } }, '!r', 'scs', NOW, false)).toBe(true);
    expect(muteBlocksPush({ rooms: { '!r': { until: null } } }, '!r', 'scs', NOW, false)).toBe(true);
    expect(muteBlocksPush({ rooms: { '!r': { until: null, byHide: true, prevUntil: NOW + 5 } } }, '!r', 'scs', NOW, false)).toBe(true);
  });

  it('does not block once the expiry is reached', () => {
    expect(muteBlocksPush({ rooms: { '!r': { until: NOW } } }, '!r', 'scs', NOW, false)).toBe(false);
    expect(muteBlocksPush({ all: { scs: NOW } }, '!r', 'scs', NOW, false)).toBe(false);
  });

  it('keys «all» per tenant', () => {
    expect(muteBlocksPush({ all: { scs: null } }, '!r', 'scs', NOW, false)).toBe(true);
    expect(muteBlocksPush({ all: { scs: null } }, '!r', 'kring', NOW, false)).toBe(false);
  });

  it('counts only room entries when the pusher carries no tenant', () => {
    expect(muteBlocksPush({ all: { scs: null } }, '!r', undefined, NOW, false)).toBe(false);
    expect(muteBlocksPush({ rooms: { '!r': { until: null } } }, '!r', undefined, NOW, false)).toBe(true);
  });

  it('never blocks a protected room', () => {
    expect(muteBlocksPush({ all: { scs: null }, rooms: { '!r': { until: null } } }, '!r', 'scs', NOW, true)).toBe(false);
  });

  it('tolerates missing and malformed content', () => {
    expect(muteBlocksPush(undefined, '!r', 'scs', NOW, false)).toBe(false);
    expect(muteBlocksPush({ all: 'x', rooms: [] }, '!r', 'scs', NOW, false)).toBe(false);
    expect(muteBlocksPush({ all: { scs: 'soon' }, rooms: { '!r': { until: -5 } } }, '!r', 'scs', NOW, false)).toBe(false);
    expect(muteBlocksPush({ rooms: { '!r': 'yes' } }, '!r', 'scs', NOW, false)).toBe(false);
  });

  it('ignores other rooms\' entries', () => {
    expect(muteBlocksPush({ rooms: { '!other': { until: null } } }, '!r', 'scs', NOW, false)).toBe(false);
  });
});

describe('nextAdhocAdmin', () => {
  it('picks the member who joined earliest', () => {
    expect(nextAdhocAdmin([
      { personKey: 'b', dateOfEntry: '20260102' },
      { personKey: 'a', dateOfEntry: '20260101' },
    ])).toBe('a');
  });

  it('breaks a tie by input order', () => {
    expect(nextAdhocAdmin([
      { personKey: 'b', dateOfEntry: '20260101' },
      { personKey: 'a', dateOfEntry: '20260101' },
    ])).toBe('b');
  });

  it('is undefined when nobody remains', () => {
    expect(nextAdhocAdmin([])).toBeUndefined();
  });
});

describe('BoundedTtlCache', () => {
  it('returns a value within its TTL and forgets it afterwards', () => {
    const c = new BoundedTtlCache<string>(10, 100);
    c.set('k', 'v', 0);
    expect(c.get('k', 99)).toEqual({ value: 'v' });
    expect(c.get('k', 100)).toBeUndefined();
  });

  it('caches undefined as a hit', () => {
    const c = new BoundedTtlCache<string | undefined>(10, 100);
    c.set('k', undefined, 0);
    expect(c.get('k', 1)).toEqual({ value: undefined });
  });

  it('honours a per-entry TTL', () => {
    const c = new BoundedTtlCache<string>(10, 100);
    c.set('k', 'v', 0, 10);
    expect(c.get('k', 11)).toBeUndefined();
  });

  it('evicts the oldest entry beyond its size', () => {
    const c = new BoundedTtlCache<number>(2, 1000);
    c.set('a', 1, 0);
    c.set('b', 2, 1);
    c.set('c', 3, 2);
    expect(c.size).toBe(2);
    expect(c.get('a', 3)).toBeUndefined();
    expect(c.get('c', 3)).toEqual({ value: 3 });
  });
});

describe('chatDeepLink', () => {
  it('links into the group chat page when a group key is given', () => {
    expect(chatDeepLink('!abc:hs', 'scs_notfall')).toBe('/private/scs_notfall_chat?selectedRoom=!abc%3Ahs');
  });
  it('falls back to the generic chat page without a group key', () => {
    expect(chatDeepLink('!abc:hs')).toBe('/private/chat?selectedRoom=!abc%3Ahs');
    expect(chatDeepLink('!abc:hs', '')).toBe('/private/chat?selectedRoom=!abc%3Ahs');
  });
  it('URL-encodes the room id', () => {
    expect(chatDeepLink('!a/b?c&d:hs')).toBe('/private/chat?selectedRoom=!a%2Fb%3Fc%26d%3Ahs');
  });
});

// Mirrors describe('groupKeyFromRoomAlias') in libs/chat/util/src/lib/chat.util.spec.ts.
describe('groupKeyFromRoomAlias', () => {
  it('reads the okey off a group alias', () => {
    expect(groupKeyFromRoomAlias('#group_scs_notfall:bkchat.etke.host')).toBe('scs_notfall');
  });
  it('lowercases a legacy mixed-case alias', () => {
    expect(groupKeyFromRoomAlias('#group_Trainerteam:bkchat.etke.host')).toBe('trainerteam');
  });
  it('is undefined for a non-group alias or none', () => {
    expect(groupKeyFromRoomAlias('#ask_notfall_kaiser:bkchat.etke.host')).toBeUndefined();
    expect(groupKeyFromRoomAlias(undefined)).toBeUndefined();
    expect(groupKeyFromRoomAlias('')).toBeUndefined();
  });
});

// Mirrors describe('serverNameOf') in libs/chat/util/src/lib/chat.util.spec.ts.
describe('serverNameOf', () => {
  it('strips the scheme and the matrix. api subdomain', () => {
    expect(serverNameOf('https://matrix.bkchat.etke.host')).toBe('bkchat.etke.host');
  });
  it('leaves a bare server name alone and drops a trailing slash', () => {
    expect(serverNameOf('bkchat.etke.host')).toBe('bkchat.etke.host');
    expect(serverNameOf('https://matrix.bkchat.etke.host/')).toBe('bkchat.etke.host');
  });
});

describe('directCounterpartOf', () => {
  const members = ['@kaiser:hs', '@anna:hs'];
  it('is the member that is not the pusher owner', () => {
    expect(directCounterpartOf(members, '@kaiser:hs', '@anna:hs')).toBe('@anna:hs');
    expect(directCounterpartOf(members, '@anna:hs', '@anna:hs')).toBe('@kaiser:hs');
  });
  it('falls back to the sender when the pusher carries no matrixUserId', () => {
    expect(directCounterpartOf(members, undefined, '@anna:hs')).toBe('@anna:hs');
  });
  it('is undefined without exactly two members', () => {
    expect(directCounterpartOf(undefined, '@kaiser:hs', '@anna:hs')).toBeUndefined();
    expect(directCounterpartOf(['@kaiser:hs'], '@kaiser:hs', '@anna:hs')).toBeUndefined();
  });
  it('is undefined when neither the owner nor the sender is one of the members', () => {
    expect(directCounterpartOf(members, '@other:hs', '@x:hs')).toBeUndefined();
    expect(directCounterpartOf(members, undefined, '@x:hs')).toBeUndefined();
    expect(directCounterpartOf(members, undefined, undefined)).toBeUndefined();
  });
});

// Review Focus 1: a DM with a person who joined the tenant minutes ago must not be dropped for
// the whole 5-minute scope TTL — a counterpart miss reloads the scope once it is older than 60 s.
describe('needsScopeRefresh', () => {
  const scope: TenantRoomScope = {
    groupRoomIds: new Set(), groupAliasLocalparts: new Set(), personKeys: new Set(['kaiser']), serverName: 'hs',
  };
  const dmWith = (who: string) => ({ roomId: '!dm:hs', directCounterpart: who });

  it('is true for an unknown DM counterpart once the scope is older than 60 s', () => {
    expect(needsScopeRefresh(dmWith('@newbie:hs'), scope, 61_000)).toBe(true);
  });
  it('is false while the scope is at most 60 s old', () => {
    expect(needsScopeRefresh(dmWith('@newbie:hs'), scope, 60_000)).toBe(false);
    expect(needsScopeRefresh(dmWith('@newbie:hs'), scope, 5_000)).toBe(false);
  });
  it('is false for a known counterpart (case-insensitive)', () => {
    expect(needsScopeRefresh(dmWith('@Kaiser:hs'), scope, 240_000)).toBe(false);
  });
  it('is false for a room that is not a DM, or without facts', () => {
    expect(needsScopeRefresh({ roomId: '!g:hs', canonicalAlias: '#group_x:hs' }, scope, 240_000)).toBe(false);
    expect(needsScopeRefresh(undefined, scope, 240_000)).toBe(false);
  });
});

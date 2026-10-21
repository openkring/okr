import { describe, expect, it } from 'vitest';

import { aliasLocalpartOf, getRoomDetailsSections, roomKindOf, RoomDetailsCtx, RoomKind } from './room-details.util';

const ctx = (kind: RoomKind, patch: Partial<RoomDetailsCtx> = {}): RoomDetailsCtx => ({
  kind,
  isAdmin: false,
  isPrivileged: false,
  isGroupAdmin: false,
  isCreator: false,
  isKiosk: false,
  activePinCount: 1,
  ...patch,
});

const sections = (kind: RoomKind, patch: Partial<RoomDetailsCtx> = {}) => getRoomDetailsSections(ctx(kind, patch));

describe('tiles', () => {
  it('offers mute, pins and help', () => {
    expect(sections('group').tiles).toEqual(['mute', 'pins', 'help']);
  });

  it('hides the pins tile without active pins', () => {
    expect(sections('group', { activePinCount: 0 }).tiles).toEqual(['mute', 'help']);
  });

  it('never offers mute for the support room', () => {
    expect(sections('support').tiles).toEqual(['pins', 'help']);
  });

  it('gives notes all three', () => {
    expect(sections('notes').tiles).toEqual(['mute', 'pins', 'help']);
  });
});

describe('members', () => {
  it.each<[RoomKind, string]>([
    ['dm', 'counterpart'],
    ['group', 'readonly'],
    ['pinboard', 'readonly'],
    ['adhoc', 'manage'],
    ['notes', 'none'],
    ['support', 'none'],
    ['other', 'readonly'],
  ])('%s -> %s', (kind, mode) => {
    expect(sections(kind).members).toBe(mode);
  });

  it('lets every ad-hoc member invite, nobody else', () => {
    expect(sections('adhoc').canInvite).toBe(true);
    for (const kind of ['dm', 'group', 'pinboard', 'notes', 'support', 'other'] as RoomKind[]) {
      expect(sections(kind, { isAdmin: true }).canInvite).toBe(false);
    }
  });

  it('lets only the creator or an admin remove ad-hoc members', () => {
    expect(sections('adhoc').canRemoveMembers).toBe(false);
    expect(sections('adhoc', { isCreator: true }).canRemoveMembers).toBe(true);
    expect(sections('adhoc', { isAdmin: true }).canRemoveMembers).toBe(true);
    expect(sections('group', { isAdmin: true, isCreator: true }).canRemoveMembers).toBe(false);
  });
});

describe('hide and leave', () => {
  it.each<[RoomKind, boolean, boolean]>([
    ['dm', true, true],
    ['adhoc', true, true],
    ['group', true, false],
    ['pinboard', true, true],
    ['notes', false, false],
    ['support', false, false],
    ['other', true, true],
  ])('%s: hide %s, leave %s', (kind, hide, leave) => {
    const s = sections(kind);
    expect(s.hide).toBe(hide);
    expect(s.leave).toBe(leave);
  });
});

describe('archive', () => {
  it('never archives a DM, notes or support room', () => {
    for (const kind of ['dm', 'notes', 'support'] as RoomKind[]) {
      const s = sections(kind, { isAdmin: true, isPrivileged: true, isCreator: true, isGroupAdmin: true });
      expect(s.archive).toBe(false);
      expect(s.archiveViaGroup).toBe(false);
    }
  });

  it('lets the creator or an admin archive an ad-hoc chat', () => {
    expect(sections('adhoc').archive).toBe(false);
    expect(sections('adhoc', { isCreator: true }).archive).toBe(true);
    expect(sections('adhoc', { isAdmin: true }).archive).toBe(true);
  });

  it('lets privileged users and admins archive a pinboard', () => {
    expect(sections('pinboard').archive).toBe(false);
    expect(sections('pinboard', { isPrivileged: true }).archive).toBe(true);
    expect(sections('pinboard', { isAdmin: true }).archive).toBe(true);
  });

  it('lets only an admin archive an unmarked room', () => {
    expect(sections('other', { isPrivileged: true }).archive).toBe(false);
    expect(sections('other', { isAdmin: true }).archive).toBe(true);
  });

  it('points a group room to its group instead', () => {
    expect(sections('group', { isAdmin: true }).archive).toBe(false);
    expect(sections('group').archiveViaGroup).toBe(false);
    expect(sections('group', { isGroupAdmin: true }).archiveViaGroup).toBe(true);
    expect(sections('group', { isPrivileged: true }).archiveViaGroup).toBe(true);
    expect(sections('group', { isAdmin: true }).archiveViaGroup).toBe(true);
  });
});

describe('pinForAll', () => {
  it('is open to everyone in a DM or ad-hoc chat', () => {
    expect(sections('dm').pinForAll).toBe(true);
    expect(sections('adhoc').pinForAll).toBe(true);
  });

  it('needs a group admin, privileged user or admin in group and pinboard rooms', () => {
    for (const kind of ['group', 'pinboard'] as RoomKind[]) {
      expect(sections(kind).pinForAll).toBe(false);
      expect(sections(kind, { isGroupAdmin: true }).pinForAll).toBe(true);
      expect(sections(kind, { isPrivileged: true }).pinForAll).toBe(true);
      expect(sections(kind, { isAdmin: true }).pinForAll).toBe(true);
    }
  });

  it('is off for notes, support and other rooms', () => {
    for (const kind of ['notes', 'support', 'other'] as RoomKind[]) {
      expect(sections(kind, { isAdmin: true, isPrivileged: true, isGroupAdmin: true }).pinForAll).toBe(false);
    }
  });
});

describe('kiosk', () => {
  const kinds: RoomKind[] = ['dm', 'group', 'adhoc', 'pinboard', 'notes', 'support', 'other'];

  it.each(kinds)('offers no membership or visibility change in a %s room', (kind) => {
    const s = sections(kind, { isKiosk: true, isAdmin: true, isPrivileged: true, isGroupAdmin: true, isCreator: true });
    expect(s.hide).toBe(false);
    expect(s.archive).toBe(false);
    expect(s.archiveViaGroup).toBe(false);
    expect(s.leave).toBe(false);
    expect(s.canInvite).toBe(false);
    expect(s.canRemoveMembers).toBe(false);
    expect(s.pinForAll).toBe(false);
  });

  it('drops the mute tile but keeps pins and help', () => {
    expect(sections('group', { isKiosk: true }).tiles).toEqual(['pins', 'help']);
    expect(sections('dm', { isKiosk: true, activePinCount: 0 }).tiles).toEqual(['help']);
  });

  it('keeps the members list mode', () => {
    expect(sections('adhoc', { isKiosk: true }).members).toBe('manage');
    expect(sections('dm', { isKiosk: true }).members).toBe('counterpart');
  });
});

describe('roomKindOf', () => {
  const base = { isDirect: false, isNotes: false, isSupport: false };

  it('lets notes beat everything', () => {
    expect(roomKindOf({ isDirect: true, isNotes: true, isSupport: true, groupKind: 'group' })).toBe('notes');
  });

  it('lets support beat direct and group', () => {
    expect(roomKindOf({ ...base, isDirect: true, isSupport: true, groupKind: 'group' })).toBe('support');
  });

  it('lets direct beat the group kind', () => {
    expect(roomKindOf({ ...base, isDirect: true, groupKind: 'chat' })).toBe('dm');
  });

  it('maps the group kind', () => {
    expect(roomKindOf({ ...base, groupKind: 'chat' })).toBe('adhoc');
    expect(roomKindOf({ ...base, groupKind: 'group' })).toBe('group');
    expect(roomKindOf({ ...base, groupKind: 'pinboard' })).toBe('pinboard');
  });

  it('falls back to other', () => {
    expect(roomKindOf(base)).toBe('other');
  });
});

describe('aliasLocalpartOf', () => {
  it('strips the sigil and the server', () => {
    expect(aliasLocalpartOf('#group_scs_support:bkchat.etke.host')).toBe('group_scs_support');
  });

  it('is empty without an alias', () => {
    expect(aliasLocalpartOf(undefined)).toBe('');
    expect(aliasLocalpartOf('Ein Thema')).toBe('');
  });
});

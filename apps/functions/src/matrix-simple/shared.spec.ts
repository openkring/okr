import { describe, expect, it } from 'vitest';

import { askRoomAliasLocalpart, groupRoomAliasLocalpart, roomAdmitsTenant } from './shared';

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

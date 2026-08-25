import { describe, expect, it } from 'vitest';

import { buildPowerLevels, privilegedPersonKeys } from './post-policy';

const NO_LEVELS = {};
const ADMINS = ['@bot:matrix.example'];
const PRIVILEGED = ['@anna:matrix.example', '@beat:matrix.example'];

describe('buildPowerLevels — die Vorgabe schaltet nichts stumm', () => {
  // Der Regressionstest aus §8 des Entwurfs. Faellt er, wurde die Vorgabe zurueckgedreht
  // und der naechste Abgleichlauf wuerde jeden bestehenden Gruppenraum stummschalten.
  it('returns undefined for undefined — a legacy group is never touched', () => {
    expect(buildPowerLevels(undefined, NO_LEVELS, PRIVILEGED, ADMINS)).toBeUndefined();
  });

  it("returns undefined for 'all' — an ordinary group chat is never touched", () => {
    expect(buildPowerLevels('all', NO_LEVELS, PRIVILEGED, ADMINS)).toBeUndefined();
  });

  it("returns a reset patch for 'all' when the room IS currently muted", () => {
    // Der Rueckweg 'privileged' -> 'all' (§3.1): nur hier wird aktiv zurueckgesetzt.
    const patch = buildPowerLevels('all', { events_default: 50 }, PRIVILEGED, ADMINS);
    expect(patch?.events_default).toBe(0);
  });
});

describe("buildPowerLevels — 'privileged'", () => {
  it('requires power 50 to post', () => {
    expect(buildPowerLevels('privileged', NO_LEVELS, PRIVILEGED, ADMINS)?.events_default).toBe(50);
  });

  it('leaves reactions open to everyone', () => {
    expect(buildPowerLevels('privileged', NO_LEVELS, PRIVILEGED, ADMINS)?.events['m.reaction']).toBe(0);
  });

  it('gives admins 100 and privileged users 50', () => {
    const users = buildPowerLevels('privileged', NO_LEVELS, PRIVILEGED, ADMINS)?.users;
    expect(users).toEqual({
      '@bot:matrix.example': 100,
      '@anna:matrix.example': 50,
      '@beat:matrix.example': 50,
    });
  });

  it('never lowers an existing higher power — the room creator keeps their 100', () => {
    // Sonst nimmt der erste Lauf dem Erzeuger die Rechte, mit denen der zweite laufen muss.
    const users = buildPowerLevels(
      'privileged',
      { users: { '@creator:matrix.example': 100, '@anna:matrix.example': 100 } },
      PRIVILEGED,
      ADMINS,
    )?.users;
    expect(users?.['@creator:matrix.example']).toBe(100);
    expect(users?.['@anna:matrix.example']).toBe(100);
  });

  it('keeps other event overrides that are already set', () => {
    const patch = buildPowerLevels('privileged', { events: { 'm.room.name': 100 } }, [], ADMINS);
    expect(patch?.events).toEqual({ 'm.room.name': 100, 'm.reaction': 0 });
  });
});

describe('privilegedPersonKeys', () => {
  const users = [
    { personKey: 'anna', tenants: ['scs'], roles: { privileged: true } },
    { personKey: 'bea', tenants: ['scs'], roles: { admin: true } },
    { personKey: 'carl', tenants: ['scs'], roles: { groupAdmin: true } },
    { personKey: 'dora', tenants: ['elab'], roles: { privileged: true } },
    { personKey: 'egon', tenants: ['scs'], roles: { privileged: true }, isArchived: true },
    { personKey: 'fritz', tenants: ['scs'], roles: {} },
  ];

  it('reads privileged and admin from the user roles', () => {
    const { adminKeys, privilegedKeys } = privilegedPersonKeys(users, 'scs');
    expect(adminKeys).toEqual(['bea']);
    expect(privilegedKeys).toEqual(['anna']);
  });

  it('never derives write rights from a group admin role', () => {
    // §3.2b: group.admins[] ist ausdruecklich keine zweite Quelle. carl ist groupAdmin
    // und bekommt trotzdem keine Power.
    const { adminKeys, privilegedKeys } = privilegedPersonKeys(users, 'scs');
    expect([...adminKeys, ...privilegedKeys]).not.toContain('carl');
  });

  it('drops users of another tenant', () => {
    const { privilegedKeys } = privilegedPersonKeys(users, 'scs');
    expect(privilegedKeys).not.toContain('dora');
  });

  it('drops archived users', () => {
    const { privilegedKeys } = privilegedPersonKeys(users, 'scs');
    expect(privilegedKeys).not.toContain('egon');
  });

  it('drops users without a person key', () => {
    expect(privilegedPersonKeys([{ tenants: ['scs'], roles: { privileged: true } }], 'scs').privilegedKeys).toEqual([]);
  });
});

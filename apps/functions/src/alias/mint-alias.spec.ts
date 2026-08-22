import { describe, expect, it, vi } from 'vitest';

import type { AliasSpaceModel } from '@okr/shared-models';

import { assertMayMint, assertTargetAcceptable, mintAlias } from './mint-alias';
import type { MintParams } from './types';

const spaceQr = (over: Partial<AliasSpaceModel> = {}): AliasSpaceModel => ({
  okey: 's1',
  tenants: ['scs'],
  isArchived: false,
  notes: '',
  name: 'qr',
  label: 'alias.space.qr',
  kind: 'redirect',
  length: 6,
  charset: 'base32-safe',
  allowCustom: false,
  caseSensitive: false,
  targetTypes: ['url', 'model'],
  defaultValidDays: 0,
  defaultMaxUses: 0,
  trackingLevel: 'counter',
  retentionDays: 365,
  roleNeeded: 'privileged',
  isEnabled: true,
  ...over,
} as AliasSpaceModel);

const params = (over: Partial<MintParams> = {}): MintParams => ({
  tenantId: 'scs',
  space: spaceQr(),
  targetType: 'url',
  targetUrl: 'https://seeclub.org',
  targetKey: '',
  original: 'https://seeclub.org',
  notes: '',
  createdBy: 'person.me',
  now: '20260822120000',
  ...over,
});

/** Ein Firestore-Doppel, das nur das kennt, was mintAlias anfasst. */
const fakeDb = (create: ReturnType<typeof vi.fn>, set?: ReturnType<typeof vi.fn>) =>
  ({ collection: () => ({ doc: () => ({ create, set }) }) }) as never;

describe('assertMayMint', () => {
  it('lets the space decide who may mint in it', () => {
    expect(() => assertMayMint(spaceQr(), { privileged: true })).not.toThrow();
    expect(() => assertMayMint(spaceQr(), { memberAdmin: true })).toThrow(/privileged/);
  });

  it('always admits an admin, so a space need not name the role twice', () => {
    expect(() => assertMayMint(spaceQr(), { admin: true })).not.toThrow();
  });
});

describe('assertTargetAcceptable', () => {
  it('rejects a target type the space does not accept', () => {
    expect(() => assertTargetAcceptable(spaceQr(), 'none', '', '')).toThrow(/targetType/);
  });

  it('rejects a non-https url — open-redirect protection', () => {
    expect(() => assertTargetAcceptable(spaceQr(), 'url', 'javascript:alert(1)', '')).toThrow();
    expect(() => assertTargetAcceptable(spaceQr(), 'url', 'http://example.org', '')).toThrow();
    expect(() => assertTargetAcceptable(spaceQr(), 'url', 'data:text/html,x', '')).toThrow();
  });

  // Der TP1-Review-Befund als SCHREIB-Gate: ein Code, der nie aufloesen kann, wird gar nicht
  // erst gepraegt — sonst steht er am Ende auf einem Plakat.
  it('rejects a model target the app cannot route to', () => {
    expect(() => assertTargetAcceptable(spaceQr(), 'model', '', 'calevent.abc')).toThrow(/detail route/i);
    expect(() => assertTargetAcceptable(spaceQr(), 'model', '', 'trip.abc')).toThrow(/detail route/i);
  });

  it('accepts a person target and an https url', () => {
    expect(() => assertTargetAcceptable(spaceQr(), 'model', '', 'person.abc')).not.toThrow();
    expect(() => assertTargetAcceptable(spaceQr(), 'url', 'https://example.org', '')).not.toThrow();
  });
});

describe('mintAlias', () => {
  it('retries on collision and succeeds on the next free code', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce({ code: 6 })   // ALREADY_EXISTS
      .mockResolvedValueOnce(undefined);

    const result = await mintAlias(fakeDb(create), params());

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.alias).toHaveLength(6);
  });

  it('gives up after five collisions rather than looping forever', async () => {
    const create = vi.fn().mockRejectedValue({ code: 6 });

    await expect(mintAlias(fakeDb(create), params())).rejects.toThrow(/collision/i);
    expect(create).toHaveBeenCalledTimes(5);
  });

  // Der Grund, warum aliases ueberhaupt CF-write-only ist.
  it('never uses set() — a printed alias must not be silently overwritten', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn();

    await mintAlias(fakeDb(create, set), params());

    expect(set).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('writes the space name, the target and the author onto the document', async () => {
    const create = vi.fn().mockResolvedValue(undefined);

    await mintAlias(fakeDb(create), params({ notes: 'Plakat Bootshaus' }));

    const written = create.mock.calls[0][0];
    expect(written.space).toBe('qr');
    expect(written.targetUrl).toBe('https://seeclub.org');
    expect(written.createdBy).toBe('person.me');
    expect(written.createdAt).toBe('20260822120000');
    expect(written.notes).toBe('Plakat Bootshaus');
    expect(written.tenants).toEqual(['scs']);
    expect(written.useCount).toBe(0);
    expect(written.isEnabled).toBe(true);
    expect(written.okey).toBeUndefined();   // okey wird vor dem Schreiben abgestreift
  });

  it('honours a vanity alias when the space allows it, without retrying', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const space = spaceQr({ allowCustom: true });

    const result = await mintAlias(fakeDb(create), params({ space, requestedAlias: 'bootshaus' }));

    expect(result.alias).toBe('bootshaus');
    expect(create).toHaveBeenCalledTimes(1);
  });

  // Bei einem Vanity-Handle ist "schon vergeben" die richtige Antwort, nicht ein anderer Code:
  // der Aufrufer wollte GENAU diesen.
  it('reports a taken vanity alias instead of quietly minting a different code', async () => {
    const create = vi.fn().mockRejectedValue({ code: 6 });
    const space = spaceQr({ allowCustom: true });

    await expect(mintAlias(fakeDb(create), params({ space, requestedAlias: 'bootshaus' })))
      .rejects.toThrow(/already taken/i);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('refuses a vanity alias when the space forbids custom handles', async () => {
    const create = vi.fn().mockResolvedValue(undefined);

    await expect(mintAlias(fakeDb(create), params({ requestedAlias: 'bootshaus' })))
      .rejects.toThrow(/allowCustom/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a vanity alias whose characters would break the route or the doc id', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const space = spaceQr({ allowCustom: true });

    for (const bad of ['boot/haus', 'boot haus', 'boot_haus']) {
      await expect(mintAlias(fakeDb(create), params({ space, requestedAlias: bad })))
        .rejects.toThrow(/not a valid alias/);
    }
    expect(create).not.toHaveBeenCalled();
  });
});

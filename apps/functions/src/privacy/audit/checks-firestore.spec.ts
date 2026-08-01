import type { AppConfig } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { check1, check2, check3, check4, check9, check11 } from './checks-firestore';
import type { AuditCtx, AuditDoc } from './types';

type Fixture = Record<string, Record<string, unknown>[]> & { config?: Partial<AppConfig> };

const toDocs = (rows: Record<string, unknown>[]): AuditDoc[] =>
  rows.map((row) => ({
    okey: String(row['okey'] ?? ''),
    data: row,
    // `updatedAt` mirrors the snapshot's server-side updateTime in production.
    updatedAt: row['updatedAt'] as number | undefined,
  }));

export const ctxWith = (data: Fixture): AuditCtx => ({
  tenantId: 'scs',
  config: { integrations: {}, additionalProcessors: [], privacyPolicyVersion: '', ...(data.config ?? {}) } as AppConfig,
  load: async (collection) => toDocs((data[collection] as Record<string, unknown>[]) ?? []),
  listCollections: async () => Object.keys(data).filter((k) => k !== 'config'),
});

describe('check 1 — resurrected sensitive keys on persons/orgs', () => {
  it('is clean when no person carries a forbidden key', async () => {
    expect(await check1.run(ctxWith({ persons: [{ okey: 'p1', firstName: 'A' }] }))).toBeUndefined();
  });

  it('flags a person that carries ssnId', async () => {
    const f = await check1.run(ctxWith({ persons: [{ okey: 'p1', ssnId: '756…' }] }));
    expect(f?.severity).toBe('error');
    expect(f?.count).toBe(1);
  });

  it('flags every forbidden key, not just ssnId', async () => {
    for (const key of ['dateOfBirth', 'dateOfDeath', 'favEmail', 'favPhone']) {
      expect(await check1.run(ctxWith({ persons: [{ okey: 'p1', [key]: 'x' }] })), key).toBeDefined();
    }
  });

  it('checks orgs too, not only persons', async () => {
    expect(await check1.run(ctxWith({ orgs: [{ okey: 'o1', favEmail: 'a@b.ch' }] }))).toBeDefined();
  });

  it('ignores a key that is present but empty — a cleared field is not a resurrection', async () => {
    expect(await check1.run(ctxWith({ persons: [{ okey: 'p1', ssnId: '' }] }))).toBeUndefined();
  });

  it('never puts the offending value in the finding', async () => {
    const f = await check1.run(ctxWith({ persons: [{ okey: 'p1', ssnId: '756.1234.5678.90' }] }));
    expect(JSON.stringify(f)).not.toContain('756.1234');
  });

  it('caps sampleKeys at ten', async () => {
    const persons = Array.from({ length: 25 }, (_, i) => ({ okey: `p${i}`, ssnId: 'x' }));
    const f = await check1.run(ctxWith({ persons }));
    expect(f?.count).toBe(25);
    expect(f?.sampleKeys.length).toBe(10);
  });
});

describe('check 2 — address channels absent from CHANNEL_SENSITIVITY_FLOOR', () => {
  it('is clean for the known channels', async () => {
    // email/phone/postal are absent from the FLOOR map by design — their visibility comes
    // from the usage flag and the tenant floor. Flagging them would be permanent noise.
    expect(await check2.run(ctxWith({ addresses: [
      { okey: 'a1', addressChannel: 'email' },
      { okey: 'a2', addressChannel: 'ssn' },
      { okey: 'a3', addressChannel: 'phone' },
      { okey: 'a4', addressChannel: 'postal' },
      { okey: 'a5', addressChannel: 'bankaccount' },
      { okey: 'a6', addressChannel: 'web' },
    ] }))).toBeUndefined();
  });

  it('ignores an empty channel — that is a different defect', async () => {
    expect(await check2.run(ctxWith({ addresses: [{ okey: 'a1', addressChannel: '' }] }))).toBeUndefined();
  });

  it('flags a channel nobody classified', async () => {
    const f = await check2.run(ctxWith({ addresses: [{ okey: 'a1', addressChannel: 'passportNumber' }] }));
    expect(f?.severity).toBe('error');
    expect(f?.count).toBe(1);
  });

  it('names the unclassified channel, which is not personal data', async () => {
    const f = await check2.run(ctxWith({ addresses: [{ okey: 'a1', addressChannel: 'passportNumber' }] }));
    expect(f?.detailDe).toContain('passportNumber');
  });
});

describe('check 3 — address-directory older than the parent last address write', () => {
  it('is clean when the projection is newer', async () => {
    expect(await check3.run(ctxWith({
      addresses: [{ okey: 'a1', parentKey: 'person.p1', updatedAt: 1000 }],
      'address-directory': [{ okey: 'scs_person.p1', parentKey: 'person.p1', updatedAt: 2000 }],
    }))).toBeUndefined();
  });

  it('flags a projection that predates the address it should reflect', async () => {
    const f = await check3.run(ctxWith({
      addresses: [{ okey: 'a1', parentKey: 'person.p1', updatedAt: 3000 }],
      'address-directory': [{ okey: 'scs_person.p1', parentKey: 'person.p1', updatedAt: 1000 }],
    }));
    expect(f?.severity).toBe('warning');
    expect(f?.sampleKeys).toContain('scs_person.p1');
  });

  it('flags a parent with addresses but no projection at all', async () => {
    const f = await check3.run(ctxWith({
      addresses: [{ okey: 'a1', parentKey: 'person.p1', updatedAt: 3000 }],
      'address-directory': [],
    }));
    expect(f?.count).toBe(1);
  });

  it('ignores archived addresses — they are not meant to be projected', async () => {
    expect(await check3.run(ctxWith({
      addresses: [{ okey: 'a1', parentKey: 'person.p1', updatedAt: 3000, isArchived: true }],
      'address-directory': [],
    }))).toBeUndefined();
  });

  it('says nothing when neither side carries a timestamp, rather than guessing', async () => {
    expect(await check3.run(ctxWith({
      addresses: [{ okey: 'a1', parentKey: 'person.p1' }],
      'address-directory': [{ okey: 'scs_person.p1', parentKey: 'person.p1' }],
    }))).toBeUndefined();
  });
});

describe('check 4 — more than one favourite per parent and channel', () => {
  it('is clean with one favourite per channel', async () => {
    expect(await check4.run(ctxWith({ addresses: [
      { okey: 'a1', parentKey: 'person.p1', addressChannel: 'email', isFavorite: true },
      { okey: 'a2', parentKey: 'person.p1', addressChannel: 'phone', isFavorite: true },
    ] }))).toBeUndefined();
  });

  it('flags two favourites of the same channel on the same parent', async () => {
    const f = await check4.run(ctxWith({ addresses: [
      { okey: 'a1', parentKey: 'person.p1', addressChannel: 'email', isFavorite: true },
      { okey: 'a2', parentKey: 'person.p1', addressChannel: 'email', isFavorite: true },
    ] }));
    expect(f?.severity).toBe('error');
    expect(f?.count).toBe(1);
  });

  it('does not flag the same channel on two different parents', async () => {
    expect(await check4.run(ctxWith({ addresses: [
      { okey: 'a1', parentKey: 'person.p1', addressChannel: 'email', isFavorite: true },
      { okey: 'a2', parentKey: 'person.p2', addressChannel: 'email', isFavorite: true },
    ] }))).toBeUndefined();
  });

  it('ignores archived addresses', async () => {
    expect(await check4.run(ctxWith({ addresses: [
      { okey: 'a1', parentKey: 'person.p1', addressChannel: 'email', isFavorite: true },
      { okey: 'a2', parentKey: 'person.p1', addressChannel: 'email', isFavorite: true, isArchived: true },
    ] }))).toBeUndefined();
  });

  it('reports the parent and channel, never an address value', async () => {
    const f = await check4.run(ctxWith({ addresses: [
      { okey: 'a1', parentKey: 'person.p1', addressChannel: 'email', isFavorite: true, email: 'a@b.ch' },
      { okey: 'a2', parentKey: 'person.p1', addressChannel: 'email', isFavorite: true, email: 'c@d.ch' },
    ] }));
    expect(JSON.stringify(f)).not.toContain('a@b.ch');
  });
});

describe('check 9 — persons with no usage preference set', () => {
  it('is clean when every person has made a choice', async () => {
    expect(await check9.run(ctxWith({ persons: [
      { okey: 'p1', usageImages: 0, usageDateOfBirth: 1, usagePostalAddress: 1, usageEmail: 1, usagePhone: 1, usageName: 1 },
    ] }))).toBeUndefined();
  });

  it('reports a legacy person relying on the implicit default', async () => {
    const f = await check9.run(ctxWith({ persons: [{ okey: 'p1', firstName: 'A' }] }));
    expect(f?.severity).toBe('info');
    expect(f?.count).toBe(1);
  });

  it('treats usage 0 (Public) as a real choice, not as "unset"', async () => {
    // 0 is falsy — reading these with `||` instead of a presence test would report
    // every member who deliberately chose Public.
    expect(await check9.run(ctxWith({ persons: [
      { okey: 'p1', usageImages: 0, usageDateOfBirth: 0, usagePostalAddress: 0, usageEmail: 0, usagePhone: 0, usageName: 0 },
    ] }))).toBeUndefined();
  });
});

describe('check 11 — collections holding a personKey with no subject-data-map row', () => {
  it('is clean for a collection the map covers', async () => {
    expect(await check11.run(ctxWith({ persons: [{ okey: 'p1', personKey: 'p1' }] }))).toBeUndefined();
  });

  it('is clean for a collection on the not-personal-data allowlist', async () => {
    expect(await check11.run(ctxWith({ locations: [{ okey: 'l1', personKey: 'p1' }] }))).toBeUndefined();
  });

  it('flags an unmapped collection that carries a subject link', async () => {
    const f = await check11.run(ctxWith({ newThing: [{ okey: 'n1', personKey: 'p1' }] }));
    expect(f?.severity).toBe('error');
    expect(f?.sampleKeys).toContain('newThing');
  });

  it('ignores an unmapped collection with no subject link at all', async () => {
    expect(await check11.run(ctxWith({ newThing: [{ okey: 'n1', colour: 'red' }] }))).toBeUndefined();
  });

  it('recognises the other subject-link shapes, not just personKey', async () => {
    for (const key of ['memberKey', 'ownerKey', 'subjectKey', 'parentKey', 'userKey']) {
      expect(await check11.run(ctxWith({ newThing: [{ okey: 'n1', [key]: 'x' }] })), key).toBeDefined();
    }
  });

  it('reports collection names, never document contents', async () => {
    const f = await check11.run(ctxWith({ newThing: [{ okey: 'n1', personKey: 'p1', secret: 'hunter2' }] }));
    expect(JSON.stringify(f)).not.toContain('hunter2');
  });
});

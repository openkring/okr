import type { AppConfig, ProcessorEntry } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { check5, check6, check7, check8, check10 } from './checks-register';
import { ctxWith } from './test-fixtures';

const completeEntry: ProcessorEntry = {
  key: 'treuhand', name: 'Treuhand AG', legalEntity: 'Treuhand AG, Zürich, CH',
  role: 'processor', category: 'externalParty', country: 'CH', transferMechanism: 'domestic',
  purposes: ['Buchhaltung'], dataClasses: ['financial'], retentionText: '10 Jahre',
  securityMeasures: ['Vertraulichkeitsvereinbarung'],
  dpaUrl: 'https://treuhand.ch/avv', privacyUrl: 'https://treuhand.ch/datenschutz',
  contact: 'datenschutz@treuhand.ch',
};

const partial = (over: Partial<ProcessorEntry>) => ({ ...completeEntry, ...over });

describe('check 5 — incomplete register entries', () => {
  it('does not flag a complete entry', async () => {
    expect(await check5.run(ctxWith({ config: { additionalProcessors: [completeEntry] } as Partial<AppConfig> })))
      .toBeUndefined();
  });

  it('flags a tenant-added processor with no DPA link', async () => {
    const f = await check5.run(ctxWith({
      config: { additionalProcessors: [partial({ dpaUrl: '' })] } as Partial<AppConfig>,
    }));
    expect(f?.count).toBe(1);
    expect(f?.severity).toBe('error');
  });

  it('flags a missing retention statement and a missing transfer mechanism too', async () => {
    for (const over of [{ retentionText: '' }, { transferMechanism: 'none' as const }, { purposes: [] }]) {
      expect(await check5.run(ctxWith({
        config: { additionalProcessors: [partial(over)] } as Partial<AppConfig>,
      })), JSON.stringify(over)).toBeDefined();
    }
  });

  it('reports the catalogue entries the tenant enabled that ship without a DPA', async () => {
    // deepsign, matrix, regasoft and searchch publish no DPA — enabling one must surface it.
    const f = await check5.run(ctxWith({ config: { integrations: { deepsign: true } } as Partial<AppConfig> }));
    expect(f?.sampleKeys).toContain('deepsign');
  });

  it('says nothing about a processor the tenant never enabled', async () => {
    const f = await check5.run(ctxWith({ config: {} }));
    expect(f?.sampleKeys ?? []).not.toContain('deepsign');
  });

  it('names keys only — a register entry is not personal data but stays terse anyway', async () => {
    const f = await check5.run(ctxWith({ config: { integrations: { deepsign: true } } as Partial<AppConfig> }));
    for (const key of f?.sampleKeys ?? []) expect(key).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});

describe('check 6 — enabled integration with no catalogue entry (drift)', () => {
  it('is clean when every enabled integration has an entry', async () => {
    expect(await check6.run(ctxWith({ config: { integrations: { deepsign: true } } as Partial<AppConfig> })))
      .toBeUndefined();
  });

  it('is clean when the tenant enabled nothing', async () => {
    expect(await check6.run(ctxWith({ config: {} }))).toBeUndefined();
  });

  it('flags an integration flag that no catalogue entry claims', async () => {
    const f = await check6.run(ctxWith({
      config: { integrations: { someNewIntegration: true } } as Partial<AppConfig>,
    }));
    expect(f?.severity).toBe('error');
    expect(f?.sampleKeys).toContain('someNewIntegration');
  });

  it('ignores a key explicitly switched off', async () => {
    expect(await check6.run(ctxWith({
      config: { integrations: { someNewIntegration: false } } as Partial<AppConfig>,
    }))).toBeUndefined();
  });
});

describe('check 7 — records past their declared retention', () => {
  it('is clean when nothing is old enough', async () => {
    // sessions carry a 12-month retention; a session from today is well inside it.
    expect(await check7.run(ctxWith({ sessions: [{ okey: 's1', updatedAt: Date.now() }] }))).toBeUndefined();
  });

  it('flags a record older than its declared retention', async () => {
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 3600 * 1000;
    const f = await check7.run(ctxWith({ sessions: [{ okey: 's1', updatedAt: twoYearsAgo }] }));
    expect(f?.severity).toBe('warning');
    expect(f?.count).toBe(1);
  });

  it('never flags a row whose retention is indefinite', async () => {
    const longAgo = Date.now() - 40 * 365 * 24 * 3600 * 1000;
    expect(await check7.run(ctxWith({ persons: [{ okey: 'p1', updatedAt: longAgo }] }))).toBeUndefined();
  });

  it('cannot judge a document with no timestamp, and says nothing rather than guessing', async () => {
    expect(await check7.run(ctxWith({ sessions: [{ okey: 's1' }] }))).toBeUndefined();
  });
});

describe('check 8 — stale policy acceptance', () => {
  it('flags users whose accepted version is behind the tenant version', async () => {
    const f = await check8.run(ctxWith({
      config: { privacyPolicyVersion: '2026-07' } as Partial<AppConfig>,
      users: [{ okey: 'u1', policyAcceptedVersion: '2025-01' }, { okey: 'u2', policyAcceptedVersion: '2026-07' }],
    }));
    expect(f?.count).toBe(1);
    expect(f?.sampleKeys).toEqual(['u1']);
  });

  it('counts a user who never accepted anything', async () => {
    const f = await check8.run(ctxWith({
      config: { privacyPolicyVersion: '2026-07' } as Partial<AppConfig>,
      users: [{ okey: 'u1' }],
    }));
    expect(f?.count).toBe(1);
  });

  it('is silent when the tenant declares no policy version', async () => {
    expect(await check8.run(ctxWith({
      config: { privacyPolicyVersion: '' } as Partial<AppConfig>, users: [{ okey: 'u1' }],
    }))).toBeUndefined();
  });

  it('reports uids, never login e-mails', async () => {
    const f = await check8.run(ctxWith({
      config: { privacyPolicyVersion: '2026-07' } as Partial<AppConfig>,
      users: [{ okey: 'u1', loginEmail: 'a@b.ch' }],
    }));
    expect(JSON.stringify(f)).not.toContain('a@b.ch');
  });
});

describe('check 10 — the standing reminder about avatars', () => {
  it('always reports, so the known gap is never silently forgotten', async () => {
    const f = await check10.run(ctxWith({}));
    expect(f?.severity).toBe('info');
    expect(f?.checkId).toBe(10);
  });

  it('explains what is not enforced', async () => {
    const f = await check10.run(ctxWith({}));
    expect(f?.detailDe).toContain('usageImages');
  });
});

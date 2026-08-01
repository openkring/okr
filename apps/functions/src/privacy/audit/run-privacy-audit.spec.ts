import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, assertNoPersonalData, runChecks, sortFindings } from './run-privacy-audit';
import { ctxWith } from './test-fixtures';
import type { AuditCheck, Finding } from './types';

const finding = (over: Partial<Finding> = {}): Finding => ({
  checkId: 1, severity: 'error', titleDe: 't', detailDe: 'd', count: 1,
  sampleKeys: ['a1'], fixRoute: '/x', ...over,
});

describe('ALL_CHECKS', () => {
  it('registers all eleven checks the spec defines', () => {
    expect(ALL_CHECKS.length).toBe(11);
    expect(ALL_CHECKS.map((c) => c.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('gives every check a German title', () => {
    for (const check of ALL_CHECKS) expect(check.titleDe.length, `check ${check.id}`).toBeGreaterThan(0);
  });
});

describe('assertNoPersonalData', () => {
  it('passes document ids through', () => {
    expect(assertNoPersonalData(finding({ sampleKeys: ['p1', 'scs_person.p1', 'addresses/a1'] })).sampleKeys)
      .toEqual(['p1', 'scs_person.p1', 'addresses/a1']);
  });

  it('drops anything that looks like an e-mail address', () => {
    expect(assertNoPersonalData(finding({ sampleKeys: ['p1', 'anna@example.ch'] })).sampleKeys).toEqual(['p1']);
  });

  it('drops a value with spaces — a name, not an id', () => {
    expect(assertNoPersonalData(finding({ sampleKeys: ['Anna Muster'] })).sampleKeys).toEqual([]);
  });
});

describe('sortFindings', () => {
  it('puts errors first, then warnings, then info', () => {
    const sorted = sortFindings([
      finding({ checkId: 9, severity: 'info' }),
      finding({ checkId: 7, severity: 'warning' }),
      finding({ checkId: 1, severity: 'error' }),
    ]);
    expect(sorted.map((f) => f.severity)).toEqual(['error', 'warning', 'info']);
  });

  it('orders by check id within a severity', () => {
    const sorted = sortFindings([
      finding({ checkId: 6, severity: 'error' }),
      finding({ checkId: 2, severity: 'error' }),
    ]);
    expect(sorted.map((f) => f.checkId)).toEqual([2, 6]);
  });
});

describe('runChecks', () => {
  const clean: AuditCheck = { id: 1, severity: 'error', titleDe: 'ok', run: async () => undefined };
  const dirty: AuditCheck = {
    id: 2, severity: 'warning', titleDe: 'hm', run: async () => finding({ checkId: 2, severity: 'warning' }),
  };
  const broken: AuditCheck = {
    id: 3, severity: 'error', titleDe: 'boom', run: async () => { throw new Error('query failed'); },
  };

  it('returns nothing when every check is clean', async () => {
    expect(await runChecks(ctxWith({}), [clean])).toEqual([]);
  });

  it('collects the findings of the checks that reported', async () => {
    const findings = await runChecks(ctxWith({}), [clean, dirty]);
    expect(findings.map((f) => f.checkId)).toEqual([2]);
  });

  it('turns a failing check into an error finding instead of losing the whole run', async () => {
    // An audit that returns nothing because one query threw looks exactly like an audit
    // that found nothing wrong — the most dangerous possible failure mode for this screen.
    const findings = await runChecks(ctxWith({}), [broken, dirty]);
    expect(findings.map((f) => f.checkId)).toContain(2);
    const failure = findings.find((f) => f.checkId === 3);
    expect(failure?.severity).toBe('error');
    expect(failure?.titleDe).toContain('3');
  });

  it('strips non-identifier sample keys from whatever a check returns', async () => {
    const leaky: AuditCheck = {
      id: 4, severity: 'error', titleDe: 'leak',
      run: async () => finding({ checkId: 4, sampleKeys: ['anna@example.ch'] }),
    };
    expect((await runChecks(ctxWith({}), [leaky]))[0].sampleKeys).toEqual([]);
  });

  it('runs the real eleven checks against an empty tenant without throwing', async () => {
    const findings = await runChecks(ctxWith({}));
    // check 10 is a standing reminder and always reports; nothing else should fire.
    expect(findings.map((f) => f.checkId)).toEqual([10]);
  });
});

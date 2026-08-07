import { describe, expect, it } from 'vitest';
import {
  HEARTBEAT_NOTICE_DAYS, HEARTBEAT_TERMINATION_DAYS, commissionEntryId, heartbeatStatus,
  meteringRecordId, missingTenants, toMeteringRecord, validatePayload,
} from './ingest.util';
import type { MeteringPayload, MeteringPayloadRow } from './ingest.util';

const row = (over: Partial<MeteringPayloadRow> = {}): MeteringPayloadRow => ({
  tenantId: 'tvm', customerName: 'Turnverein Musterhausen', segment: 'club',
  totalUsers: 120, privilegedUsers: 10, addOns: ['logbuch'], version: '7.11.0',
  activationDate: '20260101', contact: { name: 'A. Muster', role: 'Präsident', email: 'a@tvm.ch' },
  ...over,
});

const payload = (over: Partial<MeteringPayload> = {}): MeteringPayload => ({
  partnerKey: 'partnerA', period: '2026-08', tenants: [row()], ...over,
});

describe('validatePayload — fatal cases stop everything', () => {
  it('refuses a payload with no partner', () => {
    expect(validatePayload({ period: '2026-08', tenants: [] }).fatal).toMatch(/partnerKey/);
  });

  it('refuses a period that is not yyyy-mm', () => {
    expect(validatePayload(payload({ period: '2026-13' })).fatal).toMatch(/yyyy-mm/);
    expect(validatePayload(payload({ period: 'August' })).fatal).toMatch(/yyyy-mm/);
    expect(validatePayload(payload({ period: '2026-8' })).fatal).toMatch(/yyyy-mm/);
  });

  it('accepts every real month', () => {
    for (const m of ['01', '06', '12']) {
      expect(validatePayload(payload({ period: `2026-${m}` })).fatal).toBeUndefined();
    }
  });

  it('refuses a payload with no tenants array', () => {
    expect(validatePayload({ partnerKey: 'p', period: '2026-08' }).fatal).toMatch(/tenants/);
  });
});

describe('validatePayload — one bad row must not cost the whole month', () => {
  it('keeps the good rows and reports the bad ones', () => {
    const verdict = validatePayload(payload({
      tenants: [row(), row({ tenantId: 'bad', totalUsers: -1 }), row({ tenantId: 'other' })],
    }));
    expect(verdict.accepted.map(r => r.tenantId)).toEqual(['tvm', 'other']);
    expect(verdict.rejected).toEqual([
      { tenantId: 'bad', reason: expect.stringContaining('non-negative') },
    ]);
    expect(verdict.fatal).toBeUndefined();
  });

  it('rejects a row without a tenantId', () => {
    const verdict = validatePayload(payload({ tenants: [row({ tenantId: '' })] }));
    expect(verdict.rejected[0].reason).toMatch(/tenantId/);
  });

  it('rejects a duplicated tenant instead of letting array order decide the total', () => {
    const verdict = validatePayload(payload({ tenants: [row(), row({ totalUsers: 999 })] }));
    expect(verdict.accepted).toHaveLength(1);
    expect(verdict.accepted[0].totalUsers).toBe(120);
    expect(verdict.rejected[0].reason).toMatch(/duplicate/);
  });

  it('rejects more privileged users than users — the subset cannot exceed the whole', () => {
    // Otherwise the weighting (privileged count double) inflates the band for free.
    const verdict = validatePayload(payload({ tenants: [row({ totalUsers: 5, privilegedUsers: 9 })] }));
    expect(verdict.rejected[0].reason).toMatch(/cannot exceed/);
  });

  it('rejects a non-integer or non-numeric count', () => {
    expect(validatePayload(payload({ tenants: [row({ totalUsers: 1.5 })] })).rejected).toHaveLength(1);
    expect(validatePayload(payload({
      tenants: [row({ totalUsers: '12' as unknown as number })],
    })).rejected).toHaveLength(1);
  });

  it('rejects an unknown segment', () => {
    const verdict = validatePayload(payload({
      tenants: [row({ segment: 'verein' as never })],
    }));
    expect(verdict.rejected[0].reason).toMatch(/segment/);
  });

  it('tolerates a missing addOns array', () => {
    const verdict = validatePayload(payload({
      tenants: [row({ addOns: undefined as unknown as string[] })],
    }));
    expect(verdict.accepted[0].addOns).toEqual([]);
  });
});

describe('the doc id IS the idempotency key (§6)', () => {
  it('is stable for the same partner, tenant and period', () => {
    expect(meteringRecordId('partnerA', 'tvm', '2026-08')).toBe('partnerA_tvm_2026-08');
    expect(commissionEntryId('partnerA', 'tvm', '2026-08')).toBe('partnerA_tvm_2026-08');
  });

  it('differs per month, so two months never collide', () => {
    expect(meteringRecordId('partnerA', 'tvm', '2026-08'))
      .not.toBe(meteringRecordId('partnerA', 'tvm', '2026-09'));
  });
});

describe('toMeteringRecord', () => {
  it('stamps the record with the ingesting tenant and the server time', () => {
    const record = toMeteringRecord(row(), 'partnerA', '2026-08', 'kring', '20260901120000');
    expect(record.tenants).toEqual(['kring']);
    expect(record.okey).toBe('partnerA_tvm_2026-08');
    expect(record.receivedAt).toBe('20260901120000');
    expect(record.partnerKey).toBe('partnerA');
  });

  it('carries prospectKey through, empty when the partner found the customer themselves', () => {
    expect(toMeteringRecord(row({ prospectKey: 'p1' }), 'partnerA', '2026-08', 'kring', 'now').prospectKey).toBe('p1');
    expect(toMeteringRecord(row(), 'partnerA', '2026-08', 'kring', 'now').prospectKey).toBe('');
  });

  it('never takes receivedAt from the payload', () => {
    const record = toMeteringRecord(
      { ...row(), receivedAt: '19700101' } as MeteringPayloadRow & { receivedAt: string },
      'partnerA', '2026-08', 'kring', '20260901120000');
    expect(record.receivedAt).toBe('20260901120000');
  });
});

describe('heartbeatStatus — the C2 §13.3 ladder', () => {
  it('is ok on the day of the push', () => {
    expect(heartbeatStatus('20260807', '20260807')).toBe('ok');
  });

  it('raises the notice at three days', () => {
    expect(heartbeatStatus('20260804', '20260806')).toBe('ok');
    expect(heartbeatStatus('20260804', '20260807')).toBe('notice');
    expect(HEARTBEAT_NOTICE_DAYS).toBe(3);
  });

  it('raises the termination right at fourteen', () => {
    expect(heartbeatStatus('20260804', '20260817')).toBe('notice');
    expect(heartbeatStatus('20260804', '20260818')).toBe('termination-right');
    expect(HEARTBEAT_TERMINATION_DAYS).toBe(14);
  });

  it('does not start the clock on a partner who has never pushed', () => {
    // Silence before the first push is onboarding, not breach.
    expect(heartbeatStatus('', '20260807')).toBe('ok');
  });
});

describe('missingTenants — the only under-report bkaiser can see from outside', () => {
  it('names a tenant that vanished between two months', () => {
    expect(missingTenants(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });

  it('is empty when nothing vanished', () => {
    expect(missingTenants(['a'], ['a', 'b'])).toEqual([]);
  });
});

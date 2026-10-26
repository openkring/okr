import { describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin', () => ({ firestore: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'x' }) }));
vi.mock('./invoice', () => ({ runInvoiceSyncScheduled: vi.fn(async () => { calls.push('invoice'); throw new Error('boom'); }) }));
vi.mock('./bill', () => ({ runBillSyncScheduled: vi.fn(async () => { calls.push('bill'); }) }));
vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { runJobs } from '../_fanout';
import { BEXIO_MORNING_JOBS, BEXIO_MORNING_OPTIONS } from './bexio-schedules';

describe('bexioMorningSync', () => {
  it('runs invoiceSync then billSync', () => {
    expect(BEXIO_MORNING_JOBS.map((j) => j.name)).toEqual(['invoiceSync', 'billSync']);
  });

  it('a failing invoice job does not skip the bill job', async () => {
    const r = await runJobs('bexioMorningSync', BEXIO_MORNING_JOBS);
    expect(calls).toEqual(['invoice', 'bill']);
    expect(r.failed).toEqual(['invoiceSync']);
    expect(r.ran).toEqual(['billSync']);
  });

  it('uses the schedule options from the consolidation spec', () => {
    expect(BEXIO_MORNING_OPTIONS).toEqual({
      schedule: '0 6 * * *',
      timeZone: 'Europe/Zurich',
      region: 'europe-west6',
      timeoutSeconds: 540,
      secrets: [expect.anything(), expect.anything()],
    });
  });
});

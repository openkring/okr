import { describe, expect, it } from 'vitest';
import {
  NIGHTLY_JOBS, MORNING_JOBS, EVENING_JOBS, HALF_HOURLY_JOBS,
  NIGHTLY_OPTIONS, MORNING_OPTIONS, EVENING_OPTIONS, HALF_HOURLY_OPTIONS,
  nightlyMaintenance, morningJobs, eveningJobs, halfHourlyJobs,
} from './schedulers';
import { matrixAdminToken } from '../matrix-simple/shared';
import { SRV_SECRETS } from '../_gateway/adapters/srv';

const names = (jobs: { name: string }[]) => jobs.map((j) => j.name);

describe('time-slot schedulers', () => {
  it('nightly runs its thirteen jobs in order', () => {
    expect(names(NIGHTLY_JOBS)).toEqual(['tripStatsReconcile', 'crewTrackCleanup', 'trackerExpiry', 'roomPostPolicySweep', 'expiredMembershipSweep', 'pinboardSweep', 'billScanReap', 'privacyExportReap', 'mailingLettersReap', 'postVersandReconcile', 'courseEndTasks', 'energyFiguresFetch', 'webhookStuckCheck']);
  });

  it('morning runs its six jobs in order', () => {
    expect(names(MORNING_JOBS)).toEqual(['contractDeadlineScan', 'snbRates', 'partnerHeartbeats', 'taskDaily', 'pruneStalePushTokens', 'regasoftApiWatch']);
  });

  it('evening runs its two jobs in order', () => {
    expect(names(EVENING_JOBS)).toEqual(['billApproverDaily', 'tripEndOfDayClose']);
  });

  it('half-hourly: orphanSessions every run, the hourly jobs only in the :00 run', () => {
    expect(names(HALF_HOURLY_JOBS)).toEqual(['orphanSessions', 'fileTransferReap', 'weatherFetch']);
    const [orphans, reap, weather] = HALF_HOURLY_JOBS;
    expect(orphans.when).toBeUndefined();
    const at = (minute: number) => new Date(2026, 9, 24, 10, minute);
    for (const job of [reap, weather]) {
      expect(job.when?.(at(0))).toBe(true);
      expect(job.when?.(at(30))).toBe(false);
    }
  });

  it('scheduler options match the slot table', () => {
    const { secrets, ...nightly } = NIGHTLY_OPTIONS;
    expect(nightly).toEqual({ schedule: '15 3 * * *', timeZone: 'Europe/Zurich', region: 'europe-west6', timeoutSeconds: 540, memory: '512MiB' });
    expect(secrets).toHaveLength(3);
    expect(MORNING_OPTIONS).toEqual({ schedule: '0 7 * * *', timeZone: 'Europe/Zurich', region: 'europe-west6', timeoutSeconds: 540, memory: '256MiB', secrets: [matrixAdminToken, ...SRV_SECRETS] });
    expect(EVENING_OPTIONS).toEqual({ schedule: '50 23 * * *', timeZone: 'Europe/Zurich', region: 'europe-west6', timeoutSeconds: 300 });
    expect(HALF_HOURLY_OPTIONS).toEqual({ schedule: '*/30 * * * *', timeZone: 'Europe/Zurich', region: 'europe-west6', timeoutSeconds: 540, memory: '256MiB' });
  });

  it('exports four callable schedule functions', () => {
    for (const fn of [nightlyMaintenance, morningJobs, eveningJobs, halfHourlyJobs]) {
      expect(typeof fn).toBe('function');
      expect(fn.__endpoint?.scheduleTrigger?.schedule).toBeTruthy();
    }
    expect(nightlyMaintenance.__endpoint.scheduleTrigger?.schedule).toBe('15 3 * * *');
    expect(halfHourlyJobs.__endpoint.scheduleTrigger?.schedule).toBe('*/30 * * * *');
  });
});

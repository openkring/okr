// Four time-slot schedulers replace fifteen onSchedule functions (spec 1.118 A9). Each slot runs
// the unchanged job bodies in sequence via runJobs: one job's failure is logged, the rest still run.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runJobs, type NamedJob } from '../_fanout';
import { matrixAdminToken } from '../matrix-simple/shared';
import { runTripStatsReconcile, runTripEndOfDayClose } from '../trip';
import { runCrewTrackCleanup } from '../trip/crew-track';
import { runRoomPostPolicySweep } from '../matrix-simple/post-policy-sync';
import { runExpiredMembershipSweep } from '../auth/account-sync';
import { runPinboardSweep } from '../matrix-simple/pinboard';
import { runBillScanReap } from '../ocr/reap-bill-scans';
import { runPrivacyExportReap } from '../privacy/reap-exports';
import { runContractDeadlineScan } from '../contract';
import { runSnbRates } from '../exchange-rate/fetch-snb-rates';
import { runPartnerHeartbeats } from '../business';
import { runTaskDaily } from '../task/task-daily';
import { runPruneStalePushTokens } from '../push-tokens/prune-stale-tokens';
import { runBillApproverDaily } from '../bill/bill-approver-daily';
import { runOrphanSessionCleanup } from '../session';
import { runFileTransferReap } from '../file-transfer/reap-file-transfers';
import { runWeatherFetch } from '../weather/fetch-weather';

const REGION = 'europe-west6';
const TIME_ZONE = 'Europe/Zurich';

export const NIGHTLY_JOBS: NamedJob[] = [
  { name: 'tripStatsReconcile', run: runTripStatsReconcile },
  { name: 'crewTrackCleanup', run: runCrewTrackCleanup },
  { name: 'roomPostPolicySweep', run: runRoomPostPolicySweep },
  { name: 'expiredMembershipSweep', run: runExpiredMembershipSweep },
  { name: 'pinboardSweep', run: runPinboardSweep },
  { name: 'billScanReap', run: runBillScanReap },
  { name: 'privacyExportReap', run: runPrivacyExportReap },
];

export const MORNING_JOBS: NamedJob[] = [
  { name: 'contractDeadlineScan', run: runContractDeadlineScan },
  { name: 'snbRates', run: runSnbRates },
  { name: 'partnerHeartbeats', run: runPartnerHeartbeats },
  { name: 'taskDaily', run: runTaskDaily },
  { name: 'pruneStalePushTokens', run: runPruneStalePushTokens },
];

export const EVENING_JOBS: NamedJob[] = [
  { name: 'billApproverDaily', run: runBillApproverDaily },
  { name: 'tripEndOfDayClose', run: runTripEndOfDayClose },
];

/** The two former hourly jobs run only in the :00 run of the half-hourly scheduler. */
const onTheHour = (now: Date): boolean => now.getMinutes() < 30;

export const HALF_HOURLY_JOBS: NamedJob[] = [
  { name: 'orphanSessions', run: runOrphanSessionCleanup },
  { name: 'fileTransferReap', run: runFileTransferReap, when: onTheHour },
  { name: 'weatherFetch', run: runWeatherFetch, when: onTheHour },
];

// 03:15, not 02:00: 02:00-02:59 is skipped/repeated at DST changes; 03:15 was already the old slot of three of these jobs.
// 512MiB: each job fit 256MiB alone, but six in one instance hit 267MiB on 2026-10-25 (privacyExportReap was lost).
export const NIGHTLY_OPTIONS = { schedule: '15 3 * * *', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 540, memory: '512MiB' as const, secrets: [matrixAdminToken] };
export const MORNING_OPTIONS = { schedule: '0 7 * * *', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 540, memory: '256MiB' as const, secrets: [matrixAdminToken] };
export const EVENING_OPTIONS = { schedule: '50 23 * * *', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 300 };
export const HALF_HOURLY_OPTIONS = { schedule: '*/30 * * * *', timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 540, memory: '256MiB' as const };

export const nightlyMaintenance = onSchedule(NIGHTLY_OPTIONS, async () => {
  await runJobs('nightlyMaintenance', NIGHTLY_JOBS);
});

export const morningJobs = onSchedule(MORNING_OPTIONS, async () => {
  await runJobs('morningJobs', MORNING_JOBS);
});

export const eveningJobs = onSchedule(EVENING_OPTIONS, async () => {
  await runJobs('eveningJobs', EVENING_JOBS);
});

export const halfHourlyJobs = onSchedule(HALF_HOURLY_OPTIONS, async (event) => {
  const scheduled = new Date(event.scheduleTime);
  await runJobs('halfHourlyJobs', HALF_HOURLY_JOBS, Number.isNaN(scheduled.getTime()) ? new Date() : scheduled);
});

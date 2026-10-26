// One 06:00 slot for the two bexio syncs (TOC 3.41, D4). The job bodies are the former
// scheduledBexioInvoiceSync / scheduleBexioBillSync, moved unchanged; runJobs isolates their failures.
// scheduleBexioJournalSync (06:15, 1 GiB) stays its own schedule.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runJobs, type NamedJob } from '../_fanout';
import { bexioApiKey, bexioTenantId } from './shared';
import { runInvoiceSyncScheduled } from './invoice';
import { runBillSyncScheduled } from './bill';

export const BEXIO_MORNING_JOBS: NamedJob[] = [
  { name: 'invoiceSync', run: runInvoiceSyncScheduled },
  { name: 'billSync', run: runBillSyncScheduled },
];

export const BEXIO_MORNING_OPTIONS = {
  schedule: '0 6 * * *',
  timeZone: 'Europe/Zurich',
  region: 'europe-west6',
  timeoutSeconds: 540,
  secrets: [bexioApiKey, bexioTenantId],
};

export const bexioMorningSync = onSchedule(BEXIO_MORNING_OPTIONS, async () => {
  await runJobs('bexioMorningSync', BEXIO_MORNING_JOBS);
});

// apps/functions/src/_webhooks/run-selftest.ts
//
// The three ways the receiver self-test runs (spec 1.143 §4.4). The nightly run is its own
// scheduler, not a nightlyMaintenance job, so scripts/deploy-functions.mjs can fire exactly
// this test after a deploy (`gcloud scheduler jobs run`) without running the whole slot.
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAdmin } from '../business/shared';
import { selftestSecret } from './selftest-client';
import { runWebhookSelftest, type WebhookSelftestResult } from './selftest';

const CF_NAME = 'runWebhookSelftestNow';

export const webhookSelftestScheduled = onSchedule(
  { schedule: '30 3 * * *', timeZone: 'Europe/Zurich', region: 'europe-west6', timeoutSeconds: 120, secrets: [selftestSecret] },
  async () => {
    await runWebhookSelftest('nightly');
  },
);

export const runWebhookSelftestNow = onCall(
  { region: 'europe-west6', enforceAppCheck: true, maxInstances: 1, timeoutSeconds: 120, secrets: [selftestSecret] },
  async (request): Promise<WebhookSelftestResult> => {
    await requireAdmin(request, CF_NAME);
    return runWebhookSelftest('manual');
  },
);

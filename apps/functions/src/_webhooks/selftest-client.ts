// apps/functions/src/_webhooks/selftest-client.ts
//
// Our own sender for the receiver self-test (spec 1.143). Its handler is the only one
// allowed to do nothing: the test proves the path, so it must leave no trace in tenant data.
import { defineSecret } from 'firebase-functions/params';
import type { WebhookHandler } from './process';
import type { WebhookClient } from './types';

// Set with: firebase functions:secrets:set WEBHOOK_SELFTEST_SECRET (any random string).
export const selftestSecret = defineSecret('WEBHOOK_SELFTEST_SECRET');
export const SELFTEST_SIGNATURE_HEADER = 'x-okr-signature';

export interface SelftestPayload {
  runId: string;
  sentAt: string;
}

export const selftestClient: WebhookClient = {
  id: 'selftest',
  type: 'selftest',
  auth: { kind: 'hmac-body', header: SELFTEST_SIGNATURE_HEADER, secret: selftestSecret },
  tenant: { scope: 'platform' },
  split: raw => [JSON.parse(raw.toString('utf8')) as unknown],
  dedupeKey: event => String((event as Partial<SelftestPayload>)?.runId ?? ''),
  maxBodyBytes: 1024,
  retentionDays: 30,
};

export const selftestHandler: WebhookHandler = async () => ({ state: 'handled' });

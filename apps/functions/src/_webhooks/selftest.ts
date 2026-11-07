// apps/functions/src/_webhooks/selftest.ts
//
// The receiver self-test (spec 1.143): post a signed sample event to our own deployed
// receiver, wait for its row to reach `handled`, and record the outcome in one document that
// the AOC status page reads. Pure of Firestore and fetch: both are injected.
import { createHmac, randomUUID } from 'node:crypto';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { eventDocId } from './ingest';
import { SELFTEST_SIGNATURE_HEADER, selftestClient, selftestSecret } from './selftest-client';
import { WebhookEventCollection, type WebhookEventState } from './types';

export const WebhookSelftestCollection = 'webhook-selftest';
export const WEBHOOK_SELFTEST_DOC = 'latest';

export type SelftestTrigger = 'nightly' | 'deploy' | 'manual';
export type SelftestLevel = 'ok' | 'down';

export interface WebhookSelftestResult {
  level: SelftestLevel;
  checkedAt: string;
  trigger: SelftestTrigger;
  failedStep?: 'http' | 'stored' | 'processed';
  detail?: string;
  durationMs: number;
  /** Last 30 days, worst result per day (Europe/Zurich date). */
  days: { date: string; level: SelftestLevel }[];
}

export const HTTP_TIMEOUT_MS = 10_000;
export const PROCESS_TIMEOUT_MS = 60_000;
const POLL_MS = 2_000;
const MAX_DAYS = 30;

export interface SelftestDeps {
  url: string;
  secret: string;
  post(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<number>;
  readState(eventId: string): Promise<WebhookEventState | undefined>;
  readPrevious(): Promise<WebhookSelftestResult | undefined>;
  writeResult(result: WebhookSelftestResult): Promise<void>;
  now(): Date;
  sleep(ms: number): Promise<void>;
}

/** Adds one result to the day list: a `down` on a date is never overwritten by a later `ok`. */
export function mergeDays(days: WebhookSelftestResult['days'], date: string, level: SelftestLevel): WebhookSelftestResult['days'] {
  const others = days.filter(d => d.date !== date);
  const today = days.find(d => d.date === date);
  const merged = today?.level === 'down' ? 'down' : level;
  return [...others, { date, level: merged }].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_DAYS);
}

const zurichDate = (d: Date): string => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });

type Check = { failedStep?: WebhookSelftestResult['failedStep']; detail?: string };

async function check(deps: SelftestDeps): Promise<Check> {
  const runId = randomUUID();
  const body = JSON.stringify({ runId, sentAt: deps.now().toISOString() });
  const signature = createHmac('sha256', deps.secret).update(body).digest('hex');
  try {
    const status = await deps.post(deps.url, body, { 'content-type': 'application/json', [SELFTEST_SIGNATURE_HEADER]: signature }, HTTP_TIMEOUT_MS);
    if (status < 200 || status >= 300) return { failedStep: 'http', detail: `HTTP ${status}` };
  } catch (error) {
    return { failedStep: 'http', detail: String((error as Error)?.message ?? error).slice(0, 200) };
  }
  const eventId = eventDocId(selftestClient.id, runId);
  let state: WebhookEventState | undefined;
  for (let waited = 0; waited <= PROCESS_TIMEOUT_MS; waited += POLL_MS) {
    state = await deps.readState(eventId);
    if (state === 'handled') return {};
    if (state === 'failed') break;
    await deps.sleep(POLL_MS);
  }
  if (state === undefined) return { failedStep: 'stored', detail: 'no row' };
  return { failedStep: 'processed', detail: `state ${state}` };
}

export async function runWebhookSelftest(trigger: SelftestTrigger, deps: SelftestDeps = defaultDeps()): Promise<WebhookSelftestResult> {
  const started = deps.now();
  const outcome = await check(deps);
  const level: SelftestLevel = outcome.failedStep ? 'down' : 'ok';
  const previous = await deps.readPrevious();
  const result: WebhookSelftestResult = {
    level,
    checkedAt: deps.now().toISOString(),
    trigger,
    ...(outcome.failedStep ? { failedStep: outcome.failedStep, detail: outcome.detail } : {}),
    durationMs: deps.now().getTime() - started.getTime(),
    days: mergeDays(previous?.days ?? [], zurichDate(started), level),
  };
  await deps.writeResult(result);
  if (level === 'down') logger.error('webhooks: selftest failed', { failedStep: result.failedStep, detail: result.detail, trigger });
  return result;
}

function defaultDeps(): SelftestDeps {
  const db = getFirestore();
  const project = process.env['GCLOUD_PROJECT'] ?? process.env['GCP_PROJECT'] ?? '';
  const resultRef = db.collection(WebhookSelftestCollection).doc(WEBHOOK_SELFTEST_DOC);
  return {
    url: `https://europe-west6-${project}.cloudfunctions.net/webhooks/selftest`,
    secret: selftestSecret.value(),
    post: async (url, body, headers, timeoutMs) => (await fetch(url, { method: 'POST', body, headers, signal: AbortSignal.timeout(timeoutMs) })).status,
    readState: async id => (await db.collection(WebhookEventCollection).doc(id).get()).get('state') as WebhookEventState | undefined,
    readPrevious: async () => (await resultRef.get()).data() as WebhookSelftestResult | undefined,
    writeResult: async r => {
      await resultRef.set(r);
    },
    now: () => new Date(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}

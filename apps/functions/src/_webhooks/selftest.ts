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
import { pingenClient, pingenWebhookSecret } from '../pingen/pingen-webhook';
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
  /** The Pingen receiver probe (spec 1.150); absent on results written before it existed. */
  pingen?: PingenSelftestResult;
}

export interface PingenSelftestResult {
  level: SelftestLevel;
  checkedAt: string;
  failedStep?: 'http' | 'stored' | 'processed';
  detail?: string;
}

export const HTTP_TIMEOUT_MS = 10_000;
export const PROCESS_TIMEOUT_MS = 60_000;
const POLL_MS = 2_000;
const MAX_DAYS = 30;

export interface SelftestDeps {
  url: string;
  secret: string;
  /** Signing key + url of the Pingen client; without both the Pingen probe is skipped. */
  pingen?: { url: string; secret: string };
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

interface Probe {
  url: string;
  secret: string;
  header: string;
  clientId: string;
  /** The body and the dedupe key the receiver derives from it. */
  build(runId: string, sentAt: string): { body: string; dedupeKey: string };
  /** States that prove the path: a probe the handler has no record for ends `ignored`, and that is a pass. */
  passStates: WebhookEventState[];
}

const receiverProbe = (deps: SelftestDeps): Probe => ({
  url: deps.url, secret: deps.secret, header: SELFTEST_SIGNATURE_HEADER, clientId: selftestClient.id, passStates: ['handled'],
  build: (runId, sentAt) => ({ body: JSON.stringify({ runId, sentAt }), dedupeKey: runId }),
});

/**
 * A signed Pingen letter event for a letter id no `sendings` record has: the real handler runs, finds
 * nothing and ends the row `ignored`. Nothing in tenant data changes, and Pingen is never called.
 */
export const PINGEN_PROBE_PREFIX = 'selftest-';
const pingenProbe = (cfg: { url: string; secret: string }): Probe => ({
  url: cfg.url, secret: cfg.secret, header: 'Signature', clientId: pingenClient.id, passStates: ['handled', 'ignored'],
  build: runId => {
    const id = `${PINGEN_PROBE_PREFIX}${runId}`;
    const body = JSON.stringify({ data: { type: 'webhook_delivered', id, relationships: {
      deliverable: { data: { id, type: 'letters' } }, event: { data: { id, type: 'events' } },
    } } });
    return { body, dedupeKey: id };
  },
});

async function check(deps: SelftestDeps, probe: Probe = receiverProbe(deps)): Promise<Check> {
  const runId = randomUUID();
  const { body, dedupeKey } = probe.build(runId, deps.now().toISOString());
  const signature = createHmac('sha256', probe.secret).update(body).digest('hex');
  try {
    const status = await deps.post(probe.url, body, { 'content-type': 'application/json', [probe.header]: signature }, HTTP_TIMEOUT_MS);
    if (status < 200 || status >= 300) return { failedStep: 'http', detail: `HTTP ${status}` };
  } catch (error) {
    return { failedStep: 'http', detail: String((error as Error)?.message ?? error).slice(0, 200) };
  }
  const eventId = eventDocId(probe.clientId, dedupeKey);
  let state: WebhookEventState | undefined;
  for (let waited = 0; waited <= PROCESS_TIMEOUT_MS; waited += POLL_MS) {
    state = await deps.readState(eventId);
    if (state !== undefined && probe.passStates.includes(state)) return {};
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
  let pingen: PingenSelftestResult | undefined;
  if (deps.pingen) {
    const p = await check(deps, pingenProbe(deps.pingen));
    pingen = { level: p.failedStep ? 'down' : 'ok', checkedAt: deps.now().toISOString(), ...(p.failedStep ? { failedStep: p.failedStep, detail: p.detail } : {}) };
    if (pingen.level === 'down') logger.error('webhooks: pingen selftest failed', { failedStep: pingen.failedStep, detail: pingen.detail, trigger });
  }
  const result: WebhookSelftestResult = {
    level,
    checkedAt: deps.now().toISOString(),
    trigger,
    ...(outcome.failedStep ? { failedStep: outcome.failedStep, detail: outcome.detail } : {}),
    durationMs: deps.now().getTime() - started.getTime(),
    days: mergeDays(previous?.days ?? [], zurichDate(started), level),
    ...(pingen ? { pingen } : {}),
  };
  await deps.writeResult(result);
  if (level === 'down') logger.error('webhooks: selftest failed', { failedStep: result.failedStep, detail: result.detail, trigger });
  return result;
}

/** '' when the secret is not set (a function deployed without it): the Pingen probe is then skipped, not failed. */
function pingenSigningKey(): string {
  try {
    return pingenWebhookSecret.value();
  } catch {
    return '';
  }
}

function defaultDeps(): SelftestDeps {
  const db = getFirestore();
  const project = process.env['GCLOUD_PROJECT'] ?? process.env['GCP_PROJECT'] ?? '';
  const resultRef = db.collection(WebhookSelftestCollection).doc(WEBHOOK_SELFTEST_DOC);
  return {
    url: `https://europe-west6-${project}.cloudfunctions.net/webhooks/selftest`,
    secret: selftestSecret.value(),
    pingen: pingenSigningKey() ? { url: `https://europe-west6-${project}.cloudfunctions.net/webhooks/${pingenClient.id}`, secret: pingenSigningKey() } : undefined,
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

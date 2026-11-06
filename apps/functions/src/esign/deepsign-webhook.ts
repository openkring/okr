// apps/functions/src/esign/deepsign-webhook.ts
//
// DeepSign's signature callbacks on the shared webhook receiver (_webhooks). The record
// update is a pure function (deepSignUpdate); the handler only wraps it in a transaction.
// These are legally relevant signature records, so the rules below are strict: terminal
// states are never reopened, replays change nothing, and unknown events are acknowledged only.
import { logger } from 'firebase-functions/v2';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { EsignCollection } from '@okr/shared-models';
import type { WebhookHandler } from '../_webhooks/process';
import type { WebhookClient, WebhookRequest } from '../_webhooks/types';
import { verifyWebhookToken, webhookSecret, webhookTokenSecret } from './shared';

const TERMINAL_STATUSES = ['signed', 'rejected', 'withdrawn'];

export interface DeepSignPayload {
  esignId: string;
  eventType?: string;
  documentId?: string;
  signeeId?: string;
  signeeType?: string;
  timestamp?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The event time, or `now` when the sender's timestamp is missing or not a date. */
function eventTimeOf(payload: DeepSignPayload, now: Timestamp): Timestamp {
  if (typeof payload.timestamp !== 'string' || payload.timestamp === '') return now;
  const date = new Date(payload.timestamp);
  try {
    return Timestamp.fromDate(date); // throws for an invalid date or one outside Firestore's range
  } catch {
    return now;
  }
}

/** The record update for one event, or null when there is nothing to change. Pure. */
export function deepSignUpdate(record: Record<string, unknown>, payload: DeepSignPayload, now: Timestamp): Record<string, unknown> | null {
  const status = record['documentStatus'];
  const terminal = typeof status === 'string' && TERMINAL_STATUSES.includes(status);

  if (payload.eventType === 'signee-completed' && payload.signeeId) {
    // A signee who signs after the document went 'signed' is still recorded; the document
    // itself is left alone. Rejected / withdrawn documents accept nothing.
    if (terminal && status !== 'signed') return null;
    const signees = Array.isArray(record['signees']) ? (record['signees'] as Array<Record<string, unknown>>) : [];
    const target = signees.find(s => s['signeeId'] === payload.signeeId);
    if (target?.['signStatus'] === 'signed') return null; // replay
    const eventTime = eventTimeOf(payload, now);
    const audit = FieldValue.arrayUnion({ type: 'signee-signed', at: eventTime, signeeId: payload.signeeId });
    // Unknown signee on a live record: keep the audit entry, leave signees alone (as esign-webhook does).
    if (!target) return terminal ? null : { updatedAt: FieldValue.serverTimestamp(), events: audit };
    return {
      updatedAt: FieldValue.serverTimestamp(),
      signees: signees.map(s => (s === target ? { ...s, signStatus: 'signed', signedTime: eventTime, completionTime: eventTime } : s)),
      events: audit,
    };
  }

  if (payload.eventType === 'document-completed') {
    if (terminal) return null;
    const eventTime = eventTimeOf(payload, now);
    // Whole document signed -> terminal. esignArchiveSigned picks this up to archive the PDF.
    return {
      updatedAt: FieldValue.serverTimestamp(),
      documentStatus: 'signed',
      signStatus: 'signed',
      completionTime: eventTime,
      events: FieldValue.arrayUnion({ type: 'completed', at: eventTime }),
    };
  }

  return null; // unknown event: acknowledge, change nothing
}

/** JSON body + the esignId from the query (the record-token URL carries it). Throws on bad JSON. */
export function splitDeepSignEvent(raw: Buffer, req: WebhookRequest): DeepSignPayload[] {
  const body: unknown = JSON.parse(raw.toString('utf8'));
  if (!isObject(body)) throw new Error('DeepSign body is not an object');
  // Only the known fields, and only strings: the row is stored as is, and Firestore rejects nested arrays.
  const out: DeepSignPayload = { esignId: req.query['esignId'] ?? '' };
  for (const k of ['eventType', 'documentId', 'signeeId', 'signeeType', 'timestamp'] as const) {
    const v = body[k];
    if (typeof v === 'string') out[k] = v;
  }
  return [out];
}

/** Stable across provider retries. */
export function deepSignDedupeKey(event: unknown): string {
  if (!isObject(event)) throw new Error('DeepSign event is not an object');
  const part = (k: string) => (typeof event[k] === 'string' ? (event[k] as string) : '');
  return [part('esignId'), part('eventType'), part('signeeId'), part('timestamp')].join('|');
}

export type DeepSignRunner = (
  esignId: string,
  decide: (record: Record<string, unknown>) => Record<string, unknown> | null,
) => Promise<{ found: false } | { found: true; tenantId?: string; updated: boolean }>;

const runInTransaction: DeepSignRunner = (esignId, decide) =>
  getFirestore().runTransaction(async tx => {
    const ref = getFirestore().collection(EsignCollection).doc(esignId);
    const snap = await tx.get(ref);
    if (!snap.exists) return { found: false as const };
    const record = snap.data() as Record<string, unknown>;
    const tenantId = typeof record['tenantId'] === 'string' ? record['tenantId'] : undefined;
    const update = decide(record);
    if (update) tx.update(ref, update);
    return { found: true as const, tenantId, updated: update !== null };
  });

export type DeepSignLog = (clientId: string, eventType: string, state: string) => void;

export function makeDeepSignHandler(run: DeepSignRunner, log: DeepSignLog = () => undefined): WebhookHandler {
  return async event => {
    // Generic text: the payload is sender data and must not end up in failure reports.
    if (!isObject(event.payload)) throw new Error('DeepSign event payload is not an object');
    const payload = event.payload as unknown as DeepSignPayload;
    const eventType = typeof payload.eventType === 'string' ? payload.eventType : '';
    if (typeof payload.esignId !== 'string' || payload.esignId === '') {
      log(event.clientId, eventType, 'ignored');
      return { state: 'ignored' };
    }
    const result = await run(payload.esignId, record => deepSignUpdate(record, payload, Timestamp.now()));
    if (!result.found) {
      log(event.clientId, eventType, 'ignored');
      return { state: 'ignored' };
    }
    const state = result.updated ? 'handled' : 'ignored';
    log(event.clientId, eventType, state);
    return { state, tenantId: result.tenantId };
  };
}

export const deepSignHandler: WebhookHandler = makeDeepSignHandler(runInTransaction, (clientId, eventType, state) =>
  logger.info('deepSignHandler', { clientId, eventType, state }),
);

/** Both DeepSign URLs carry `?esignId=…&token=…`; the token is an HMAC of the esignId. */
const verifyEsignToken = (req: WebhookRequest, secret: string): boolean => {
  const esignId = req.query['esignId'];
  const token = req.query['token'];
  if (!esignId || !token || secret === '') return false;
  return verifyWebhookToken(esignId, token, secret);
};

const deepSignBase = {
  type: 'deepsign',
  tenant: { resolve: 'record' as const },
  split: splitDeepSignEvent,
  dedupeKey: (event: unknown) => deepSignDedupeKey(event),
  maxBodyBytes: 64_000,
  retentionDays: 30,
};

/** New documents: the URL token is made with a key DeepSign never held (callbackSecret is random). */
export const deepSignClient: WebhookClient = {
  ...deepSignBase,
  id: 'deepsign',
  auth: { kind: 'record-token', verify: verifyEsignToken, secret: webhookTokenSecret },
};

/**
 * Documents sent before the cutover: their URL token was made with WEBHOOK_SECRET.
 * Deliberately NOT in WEBHOOK_CLIENTS (no /webhooks/ route); only esignWebhook serves it.
 */
export const deepSignLegacyClient: WebhookClient = {
  ...deepSignBase,
  id: 'deepsign-legacy',
  auth: { kind: 'record-token', verify: verifyEsignToken, secret: webhookSecret },
};

/** Documents created at or after this instant are refused on the legacy URL. Empty = no cutoff. */
export const ESIGN_LEGACY_CUTOFF_ISO = '';

/** The cutoff in ms. A non-empty cutoff that does not parse throws: it must never silently refuse nothing. */
function cutoffMillis(cutoffIso: string): number {
  const ms = new Date(cutoffIso).getTime();
  if (Number.isNaN(ms)) throw new Error('ESIGN_LEGACY_CUTOFF_ISO is not a valid date');
  return ms;
}

export function refusedByCutoff(createdAt: Timestamp | undefined, cutoffIso: string): boolean {
  if (cutoffIso === '') return false;
  const cutoff = cutoffMillis(cutoffIso);
  if (!createdAt) return true;
  return createdAt.toMillis() >= cutoff;
}

export interface LegacyGateDeps {
  verify(req: WebhookRequest): boolean;
  readCreatedAt(esignId: string): Promise<{ exists: boolean; createdAt?: Timestamp }>;
}

/**
 * The gate in front of the legacy URL. 'refuse' = the record is newer than the cutoff, so it
 * must not depend on the legacy key. Reads only for a valid token (a forged call costs no read);
 * an invalid token passes through so the receiver answers 401. A failing read rejects.
 */
export async function legacyGate(req: WebhookRequest, cutoffIso: string, deps: LegacyGateDeps): Promise<'pass' | 'refuse'> {
  if (cutoffIso === '') return 'pass';
  cutoffMillis(cutoffIso); // a malformed cutoff fails for every call, valid token or not
  if (!deps.verify(req)) return 'pass';
  const { exists, createdAt } = await deps.readCreatedAt(req.query['esignId']);
  return exists && refusedByCutoff(createdAt, cutoffIso) ? 'refuse' : 'pass';
}

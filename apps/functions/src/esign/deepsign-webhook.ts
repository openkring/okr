// apps/functions/src/esign/deepsign-webhook.ts
//
// DeepSign's signature callbacks on the shared webhook receiver (_webhooks). The record
// update is a pure function (deepSignUpdate); the handler only wraps it in a transaction.
// These are legally relevant signature records: the rules below mirror esign-webhook.ts.
import { logger } from 'firebase-functions/v2';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { EsignCollection } from '@okr/shared-models';
import type { WebhookHandler } from '../_webhooks/process';
import type { WebhookRequest } from '../_webhooks/types';

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
  return [{ ...body, esignId: req.query['esignId'] ?? '' } as DeepSignPayload];
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

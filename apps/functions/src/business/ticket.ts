// apps/functions/src/business/ticket.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { CommentCollection, TicketCollection, TicketModel } from '@okr/shared-models';
import type { PartnerModel, TicketClassification, TicketSeverity } from '@okr/shared-models';
import {
  acceptSubmission, classifyTicket as applyClassification, rejectSubmission, resumeFromPartner,
  setSeverity, validateSubmission, waitOnPartner,
} from '@okr/business-ticket-util';
import { redactSensitive } from '@okr/shared-util-core';

import { PLATFORM_TENANT, REGION, nowStamp, requireAdmin, requirePartner } from './shared';
import { installedVersion } from './push';

/**
 * C4 §3/§4 — the 3LS escalation queue's API. One queue, at bkaiser, in `kring`.
 *
 * **Why callables and not `firestore.rules`.** Identical argument to `prospects` (C5 §5), and it is
 * not re-derived here: "my tickets, never another partner's" is a predicate over document CONTENT,
 * which Firestore cannot evaluate for a *list* query. So `tickets` is admin-read-only in the rules
 * and a partner reaches it only through `submitTicket` / `listTickets` / `commentTicket`,
 * authenticated by `PartnerModel.serviceUid`. **No `partner` role** — C3 decided that, and §2 of the
 * C4 spec predates the decision: a role would have to be kept out of the eight billable roles
 * (pricing §9.1) and out of every `isPrivileged()` branch in `firestore.rules`.
 *
 * The three rules that cost money live in `@okr/business-ticket-util`, not here: the supported
 * version window, the required-field set, and the two SLA legs. This file is auth, reads and writes.
 */

const db = () => getFirestore();

/** Comment threads reuse the `comments` collection, keyed `ticket.<okey>` like every other parent. */
const TICKET_PARENT_PREFIX = 'ticket';

/**
 * What a partner is handed back. Deliberately not the raw document: `classifiedBy` is a bkaiser
 * staff uid and no part of running an escalation needs the partner to have it (it is what makes
 * `tickets` a row in `subject-data-map.ts` at all).
 */
interface TicketRow {
  okey: string;
  name: string;
  status: string;
  severity: string;
  classification: string;
  classificationReason: string;
  appVersion: string;
  affectedTenantId: string;
  submittedAt: string;
  firstResponseAt: string;
  workaroundDueAt: string;
  workaroundAt: string;
  fixDueAt: string;
  fixedAt: string;
  fixVersion: string;
  closedAt: string;
  rejectedReason: string;
}

function toRow(ticket: TicketModel): TicketRow {
  return {
    okey: ticket.okey,
    name: ticket.name,
    status: ticket.status,
    severity: ticket.severity,
    classification: ticket.classification,
    classificationReason: ticket.classificationReason,
    appVersion: ticket.appVersion,
    affectedTenantId: ticket.affectedTenantId,
    submittedAt: ticket.submittedAt,
    firstResponseAt: ticket.firstResponseAt,
    workaroundDueAt: ticket.workaroundDueAt,
    workaroundAt: ticket.workaroundAt,
    fixDueAt: ticket.fixDueAt,
    fixedAt: ticket.fixedAt,
    fixVersion: ticket.fixVersion,
    closedAt: ticket.closedAt,
    rejectedReason: ticket.rejectedReason,
  };
}

function str(values: Record<string, unknown>, key: string): string {
  // Anything that is not a string is dropped rather than stringified: an object arriving under
  // `description` must never reach the record as '[object Object]', least of all unredacted.
  return typeof values[key] === 'string' ? (values[key] as string).trim() : '';
}

async function loadTicket(okey: string): Promise<TicketModel> {
  const snap = await db().collection(TicketCollection).doc(okey).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such ticket.');
  return { ...(snap.data() as TicketModel), okey: snap.id };
}

/**
 * C4 §3 — a partner escalates.
 *
 * Two refusals, and they are different things. An **incomplete** submission comes back with the
 * missing field names and is not stored: the SLA clock only ever starts on a complete one, so a
 * half-filled form must not be able to sit in the queue accruing a deadline. A submission from an
 * **unsupported version** IS stored, as `rejected` — §5 counts how often the window bites, and the
 * partner needs the record to show their customer why.
 */
export const submitTicket = onCall(
  { region: REGION },
  async (request) => {
    const partner = await requirePartner(request, 'submitTicket');
    const values = (request.data ?? {}) as Record<string, unknown>;

    const draft: TicketModel = {
      ...new TicketModel(PLATFORM_TENANT),
      name: str(values, 'name').slice(0, 120),
      partnerKey: partner.okey,
      appVersion: str(values, 'appVersion'),
      firebaseProjectId: str(values, 'firebaseProjectId'),
      affectedTenantId: str(values, 'affectedTenantId'),
      sentryEventUrl: str(values, 'sentryEventUrl'),
      reproSteps: str(values, 'reproSteps'),
      platform: str(values, 'platform'),
      feature: str(values, 'feature'),
      route: str(values, 'route'),
      occurredAt: str(values, 'occurredAt'),
      // Ids, never contents (§6.1). Non-strings are dropped for the same reason as above.
      refs: (Array.isArray(values['refs']) ? values['refs'] : [])
        .filter((r): r is string => typeof r === 'string').slice(0, 20),
      sentryEventJson: str(values, 'sentryEventJson'),
      description: str(values, 'description'),
      // §6.1: off unless the partner explicitly confirms the redaction. `acceptSubmission` drops
      // the paths again if this is false — the refusal lives in the util, next to the rule.
      redactionConfirmed: values['redactionConfirmed'] === true,
      attachmentPaths: (Array.isArray(values['attachmentPaths']) ? values['attachmentPaths'] : [])
        .filter((p): p is string => typeof p === 'string'),
    };
    draft.index = `name:${draft.name.toLowerCase()} tenant:${draft.affectedTenantId.toLowerCase()}`;

    const verdict = validateSubmission(draft, await installedVersion());
    if (verdict.rejectedReason) {
      const rejected = rejectSubmission(draft, verdict.rejectedReason);
      const okey = await write(rejected);
      logger.warn(`submitTicket: ${partner.okey} refused — ${verdict.rejectedReason}`);
      return { ok: false, okey, rejectedReason: verdict.rejectedReason, missing: [] };
    }
    if (!verdict.ok) {
      logger.info(`submitTicket: ${partner.okey} incomplete — missing ${verdict.missing.join(', ')}`);
      return { ok: false, okey: '', rejectedReason: '', missing: verdict.missing };
    }

    // `acceptSubmission` is what redacts `description`, so the record is redacted BEFORE it exists.
    // A ticket stored raw for even one write has already leaked (§6.1).
    const accepted = acceptSubmission(draft);
    const okey = await write(accepted);
    logger.info(`submitTicket: ${partner.okey} queued ${okey} (${accepted.appVersion}), workaround due ${accepted.workaroundDueAt}`);
    return { ok: true, missing: [], ...toRow({ ...accepted, okey }) };
  },
);

async function write(ticket: TicketModel): Promise<string> {
  const { okey, ...data } = ticket;   // okey IS the doc id and is never stored (repo convention)
  void okey;
  const ref = await db().collection(TicketCollection).add(data);
  return ref.id;
}

/**
 * C4 §4 `listOwn` — this partner's queue, and with a `ticketKey` the one ticket plus its thread.
 *
 * Both in one callable because they are one question asked at two zoom levels, and a second
 * callable would be a second place the "never another partner's" check has to be right.
 */
export const listTickets = onCall(
  { region: REGION },
  async (request) => {
    const partner = await requirePartner(request, 'listTickets');
    const ticketKey = String((request.data ?? {}).ticketKey ?? '');

    if (ticketKey) {
      const ticket = await requireOwn(ticketKey, partner);
      return { tickets: [toRow(ticket)], comments: await threadOf(ticketKey) };
    }
    const snap = await db().collection(TicketCollection)
      .where('partnerKey', '==', partner.okey).get();
    const tickets = snap.docs
      .map((d) => ({ ...(d.data() as TicketModel), okey: d.id }))
      .filter((t) => !t.isArchived)
      // Newest first, in memory: the queue of one partner is small, and ordering on the server
      // would need a composite index for a sort nobody paginates.
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map(toRow);
    return { tickets, comments: [] };
  },
);

/** The one content check the whole partner side rests on. */
async function requireOwn(ticketKey: string, partner: PartnerModel): Promise<TicketModel> {
  const ticket = await loadTicket(ticketKey);
  if (ticket.partnerKey !== partner.okey) {
    logger.error(`ticket ${ticketKey} requested by ${partner.okey}, which does not own it`);
    throw new HttpsError('permission-denied', 'This ticket is not yours.');
  }
  return ticket;
}

async function threadOf(ticketKey: string): Promise<{ authorName: string; description: string; creationDateTime: string }[]> {
  const snap = await db().collection(CommentCollection)
    .where('parentKey', '==', `${TICKET_PARENT_PREFIX}.${ticketKey}`).get();
  return snap.docs
    .map((d) => ({
      authorName: (d.get('authorName') as string | undefined) ?? '',
      description: (d.get('description') as string | undefined) ?? '',
      creationDateTime: (d.get('creationDateTime') as string | undefined) ?? '',
    }))
    .sort((a, b) => a.creationDateTime.localeCompare(b.creationDateTime));
}

/**
 * C4 §4 `comment` — a message on the thread, from either side.
 *
 * The thread reuses the existing `comments` collection under `parentKey = 'ticket.<okey>'` rather
 * than growing a `ticketComments` subcollection: `comments` is generic by `parentKey`, already
 * carries a row in `subject-data-map.ts`, and already has its rules. A second comment collection
 * would be a second thing to classify, erase and secure for no behaviour we do not already have.
 *
 * A partner's text is redacted on the way in exactly like `description`, and for the same reason —
 * §6.1's rule is about free text reaching the record, not about which field it arrived in. Comments
 * from bkaiser's own admins are not redacted: they are written by staff inside the product, on data
 * bkaiser is already the controller of, and redacting our own words would mangle the answers.
 */
export const commentTicket = onCall(
  { region: REGION },
  async (request) => {
    const values = (request.data ?? {}) as Record<string, unknown>;
    const ticketKey = str(values, 'ticketKey');
    const text = str(values, 'text');
    if (!ticketKey || !text) {
      throw new HttpsError('invalid-argument', 'ticketKey and text are required.');
    }

    // Partner first: a caller that is a registered partner identity is never also an admin, and
    // trying admin first would log a permission error on every partner comment.
    let authorKey = '';
    let authorName = '';
    let description = text;
    try {
      const partner = await requirePartner(request, 'commentTicket');
      await requireOwn(ticketKey, partner);
      authorKey = partner.okey;
      authorName = partner.name;
      description = redactSensitive(text) ?? '';
    } catch {
      await requireAdmin(request, 'commentTicket');
      await loadTicket(ticketKey);
      authorKey = request.auth?.uid ?? '';
      authorName = 'bkaiser';
    }

    const creationDateTime = nowStamp();
    await db().collection(CommentCollection).add({
      tenants: [PLATFORM_TENANT],
      isArchived: false,
      tags: '',
      parentKey: `${TICKET_PARENT_PREFIX}.${ticketKey}`,
      authorKey,
      authorName,
      creationDateTime,
      description,
      index: `k:${ticketKey} a:${authorKey}`,
    });
    return { ok: true, creationDateTime };
  },
);

/**
 * C4 §4 — the classification, the field that decides free vs. chargeable.
 *
 * Admin only, reason and author mandatory, and re-classifiable on request (C2 §3) — so a second
 * call overwrites rather than being refused. `applyClassification` returns `undefined` when the
 * reason is empty; that refusal is the audit requirement, not a validation nicety, so it is a hard
 * error here rather than a silent no-op.
 */
export const classifyTicket = onCall(
  { region: REGION },
  async (request) => {
    await requireAdmin(request, 'classifyTicket');
    const values = (request.data ?? {}) as Record<string, unknown>;
    const ticketKey = str(values, 'ticketKey');
    const classification = str(values, 'classification') as TicketClassification;
    const reason = str(values, 'classificationReason');
    if (!ticketKey) throw new HttpsError('invalid-argument', 'ticketKey is required.');

    const ticket = await loadTicket(ticketKey);
    const next = applyClassification(ticket, classification, reason, request.auth?.uid ?? '');
    if (!next) {
      throw new HttpsError('invalid-argument',
        'A classification needs a reason and an author — it drives billing and is audited.');
    }
    await db().collection(TicketCollection).doc(ticketKey).update({
      classification: next.classification,
      classificationReason: next.classificationReason,
      classifiedBy: next.classifiedBy,
      classifiedAt: next.classifiedAt,
    });
    logger.info(`classifyTicket: ${ticketKey} → ${next.classification} (${next.classificationReason})`);
    return { ok: true, classification: next.classification, classifiedAt: next.classifiedAt };
  },
);

type TriageAction = 'accept' | 'wait' | 'resume' | 'workaround' | 'fix' | 'close' | 'severity';

/**
 * C4 §4/§5 — every state transition the queue has, in one admin callable.
 *
 * One function rather than seven because they are one decision ("move this ticket on") and each
 * would otherwise repeat the same admin check, the same load and the same write. The transitions
 * themselves are the util's — `waitOnPartner` / `resumeFromPartner` bank the waiting time, and
 * `setSeverity` decides whether the released-fix leg is owed at all (§8).
 */
export const triageTicket = onCall(
  { region: REGION },
  async (request) => {
    await requireAdmin(request, 'triageTicket');
    const values = (request.data ?? {}) as Record<string, unknown>;
    const ticketKey = str(values, 'ticketKey');
    const action = str(values, 'action') as TriageAction;
    if (!ticketKey) throw new HttpsError('invalid-argument', 'ticketKey is required.');

    const ticket = await loadTicket(ticketKey);
    const today = nowStamp().slice(0, 8);
    let next: TicketModel;

    switch (action) {
      case 'accept':
        // The first response stamp is set once and never moved: §5 measures time-to-first-response,
        // and a second acceptance after a waiting round would flatter it.
        next = {
          ...ticket,
          status: 'accepted',
          firstResponseAt: ticket.firstResponseAt || today,
        };
        break;
      case 'wait':      next = waitOnPartner(ticket, today); break;
      case 'resume':    next = resumeFromPartner(ticket, today); break;
      case 'workaround': next = { ...ticket, workaroundAt: ticket.workaroundAt || today }; break;
      case 'fix':
        next = {
          ...ticket,
          status: 'resolved',
          fixedAt: ticket.fixedAt || today,
          fixVersion: str(values, 'fixVersion') || ticket.fixVersion,
        };
        break;
      case 'close':     next = { ...ticket, status: 'closed', closedAt: ticket.closedAt || today }; break;
      case 'severity':  next = setSeverity(ticket, str(values, 'severity') as TicketSeverity); break;
      default:
        throw new HttpsError('invalid-argument', `Unknown triage action '${action}'.`);
    }

    const { okey, ...data } = next;
    void okey;
    await db().collection(TicketCollection).doc(ticketKey).set(data);
    logger.info(`triageTicket: ${ticketKey} ${action} → ${next.status}`);
    return { ok: true, status: next.status };
  },
);

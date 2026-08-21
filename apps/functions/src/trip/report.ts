// apps/functions/src/trip/report.ts
//
// Damage ('Schadenmeldung') and bug ('Fehlermeldung') reports from the Logbuch.
//
// The report itself is not a document: it is a domain event whose consequences are
// configured as workflow rules (planning/specs/2026-08-12-workflow-trigger-rules-design.md),
// not hard-coded. Before this callable the trip store looked up a responsibility BY NAME
// ('Ressort Boote' / 'Logbuch2') and wrote the task client-side — with no validity window,
// no delegate fallback and a silent drop when the responsibility was missing.
//
// It is a callable rather than a document trigger because there is no document to trigger
// on, and the client must not be able to emit arbitrary events: the event name is derived
// here from `kind`, never taken from the request.

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { emitEvent } from '../workflow/emit';

const REGION = 'europe-west6';
const CF_NAME = 'reportIncident';
const USERS_COLLECTION = 'users';

/** The reportable kinds and the event each one emits. Closed set — the client picks a key, not an event. */
const EVENT_OF_KIND: Record<string, string> = {
  damage: 'trip.damageReported',
  bug: 'trip.bugReported',
};

export interface ReportIncidentData {
  tenantId: string;
  kind: 'damage' | 'bug';
  message: string;
  /** the reporting person (a kiosk account is shared, so this is picked in the modal, not derived from auth) */
  personKey?: string;
  personName?: string;
  boatKey?: string;
  boatName?: string;
  tripKey?: string;
  tripName?: string;
}

/**
 * Emit a damage / bug report as a workflow event.
 *
 * `relatedKey` is unique per report ('report.<uuid>') on purpose: the engine deduplicates
 * openTask on (relatedKey, assignee) and derives the Matrix txnId from it, so a shared key
 * would make the SECOND report of the day silently disappear. Every report is a distinct
 * incident, so every report gets its own key. The trip and the boat travel in `params`.
 */
export const reportIncident = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<ReportIncidentData>): Promise<{ event: string; relatedKey: string }> => {
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    const uid = request.auth!.uid;
    const d = request.data;

    const event = EVENT_OF_KIND[d?.kind ?? ''];
    if (!d?.tenantId || !event) {
      throw new HttpsError('invalid-argument', `tenantId and a known kind (${Object.keys(EVENT_OF_KIND).join('|')}) are required`);
    }
    const message = (d.message ?? '').trim();
    if (!message) throw new HttpsError('invalid-argument', 'message is required');

    const db = getFirestore();
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists) throw new HttpsError('permission-denied', 'unknown user');
    const user = userSnap.data()!;
    if (!(user['tenants'] as string[] | undefined)?.includes(d.tenantId)) {
      throw new HttpsError('permission-denied', 'not a member of this tenant');
    }

    const boatName = (d.boatName ?? '').trim();
    // the reporter is the SUBJECT of the event, so a rule with responsibilityKey 'subject'
    // reaches them — on the kiosk that is the picked person, not the shared kiosk account
    const personName = (d.personName ?? '').trim();
    const relatedKey = `report.${randomUUID()}`;

    await emitEvent(event, d.tenantId, relatedKey, {
      personKey: d.personKey ?? '',
      subjectName: personName,
      params: {
        kind: d.kind,
        boatKey: d.boatKey ?? '',
        boatName,
        personKey: d.personKey ?? '',
        personName,
        tripKey: d.tripKey ?? '',
        tripName: d.tripName ?? '',
        message,
        // `notes` is the generic free-text an emitter may hand to openTask; the boat is
        // prefixed because a task has no boat field of its own
        notes: boatName ? `${boatName}: ${message}` : message,
        reportedBy: `${user['firstName'] ?? ''} ${user['lastName'] ?? ''}`.trim(),
      },
    });

    logger.info(`${CF_NAME}: emitted ${event} (${relatedKey}) for tenant ${d.tenantId}`);
    return { event, relatedKey };
  },
);

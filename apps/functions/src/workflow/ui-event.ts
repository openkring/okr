// apps/functions/src/workflow/ui-event.ts
//
// UI-originated workflow events: a CMS button press and a menu selection
// (planning/specs/2026-08-29-generic-workflow-triggers-spec.md §2 and §3).
//
// This covers the case where the user's intent writes NO document — "Schlüssel bestellen",
// "Ich helfe am Fest mit". Everything that DOES write goes through its collection's own
// emitter instead (§6b): the write is the better trigger, because an import, an admin edit
// and a Cloud-Function write then produce the same consequence, and because `relatedKey` is
// then a real document rather than a synthetic id.
//
// It is a callable rather than a document trigger for the same reason `reportIncident` is:
// there is no document to trigger on. The client must not be able to emit an arbitrary
// event, so the event name is derived HERE from `kind`, never taken from the request.

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

import { MenuItemCollection, SectionCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { emitEvent } from './emit';

const REGION = 'europe-west6';
const CF_NAME = 'emitUiEvent';
const USERS_COLLECTION = 'users';
const COOLDOWN_COLLECTION = 'uiEvents';

/** The two UI surfaces and the event each one emits. Closed set — the client picks a key. */
export const EVENT_OF_KIND: Record<string, string> = {
  button: 'ui.buttonClicked',
  menu: 'ui.menuCalled',
};

/**
 * Per (uid, sourceKey).
 *
 * This is the first trigger an ordinary member can fire at will, and one press can open a
 * task and send a Matrix message. Decision O2: the cooldown is enough, no daily cap on top —
 * the consequence of a repeated click is a DEDUPLICATED task, so what a determined clicker
 * can do is bounded by `openTask`'s (relatedKey, assignee) rule rather than by the number of
 * calls. Revisit if a rule ever gains a non-deduplicating action.
 */
export const COOLDOWN_SECONDS = 30;

type DocData = Record<string, unknown>;

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim();

/** A clock that jumped backwards must not lock the pair out; only a RECENT past call counts. */
export function isWithinCooldown(lastFiredAtMs: number | undefined, nowMs: number): boolean {
  if (lastFiredAtMs === undefined) return false;
  const elapsed = nowMs - lastFiredAtMs;
  return elapsed >= 0 && elapsed < COOLDOWN_SECONDS * 1000;
}

/** Firestore ids may not contain '/', and neither a uid nor an okey normally does. */
export function cooldownDocId(uid: string, sourceKey: string): string {
  return `${uid}_${sourceKey}`.replaceAll('/', '_');
}

/**
 * THE one security-relevant check in this spec.
 *
 * `sourceName` — the thing a rule matches on with `paramIs:sourceName=…` — is read from the
 * section DOCUMENT and never from the request. Without this, any signed-in client could fire
 * any rule of its own tenant simply by inventing a name in the payload.
 *
 * Returns the verified name, or undefined when the source may not fire anything.
 */
export function verifyButtonSource(doc: DocData | undefined, tenantId: string): string | undefined {
  if (!doc) return undefined;
  if (doc['isArchived'] === true) return undefined;
  if (doc['type'] !== 'button') return undefined;
  if (!((doc['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return undefined;
  return str(doc['name']) || undefined;
}

/**
 * The same check for a menu item, plus decision O3: a call item fires a workflow event iff
 * its `action` is `'workflow'`. That makes "every existing call menu is untouched" a property
 * of the data model rather than a convention someone has to remember.
 */
export function verifyMenuSource(doc: DocData | undefined, tenantId: string): string | undefined {
  if (!doc) return undefined;
  if (doc['isArchived'] === true) return undefined;
  if (doc['action'] !== 'workflow') return undefined;
  if (!((doc['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return undefined;
  return str(doc['name']) || undefined;
}

export interface EmitUiEventData {
  tenantId: string;
  kind: 'button' | 'menu';
  /** the section okey or the menuItem okey — the NAME is read from that document, not sent */
  sourceKey: string;
  /** where the click happened, so the task can link back, e.g. 'page.<pageKey>' */
  linkKey?: string;
  /** free text from a preceding prompt, if the trigger collected any */
  notes?: string;
}

export type EmitUiEventResult =
  | { event: string; relatedKey: string }
  | { skipped: 'cooldown' };

/**
 * Claim the cooldown slot for (uid, sourceKey), in a transaction.
 *
 * A transaction and not a read-then-write: two taps that arrive together would both read an
 * old timestamp and both pass.
 */
async function claimCooldown(db: Firestore, uid: string, sourceKey: string, nowMs: number): Promise<boolean> {
  const ref = db.collection(COOLDOWN_COLLECTION).doc(cooldownDocId(uid, sourceKey));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.data()?.['lastFiredAt'] as number | undefined;
    if (isWithinCooldown(last, nowMs)) return false;
    tx.set(ref, { uid, sourceKey, lastFiredAt: nowMs });
    return true;
  });
}

/**
 * Emit a UI event as a workflow event.
 *
 * `relatedKey` is unique per click ('uiEvent.<uuid>') on purpose, exactly as `report.<uuid>`
 * is: the engine deduplicates `openTask` on (relatedKey, assignee) and derives the Matrix
 * txnId from it, so a stable key would make the SECOND press of the day silently disappear.
 * The cooldown above is what bounds the volume; the key is what keeps distinct intents
 * distinct.
 */
export const emitUiEvent = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<EmitUiEventData>): Promise<EmitUiEventResult> => {
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    const uid = request.auth!.uid;
    const d = request.data;

    const event = EVENT_OF_KIND[d?.kind ?? ''];
    if (!d?.tenantId || !event) {
      throw new HttpsError('invalid-argument', `tenantId and a known kind (${Object.keys(EVENT_OF_KIND).join('|')}) are required`);
    }
    const sourceKey = str(d.sourceKey);
    if (!sourceKey) throw new HttpsError('invalid-argument', 'sourceKey is required');

    const db = getFirestore();

    // An anonymous caller is rejected by checkAuthentication above; a signed-in caller of
    // ANOTHER tenant is rejected here. Both are the scope decision of the spec: a public
    // page's content goes through submitForm, which already emits.
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    const user = userSnap.data();
    if (!user) throw new HttpsError('permission-denied', 'unknown user');
    if (!((user['tenants'] as string[] | undefined) ?? []).includes(d.tenantId)) {
      throw new HttpsError('permission-denied', 'not a member of this tenant');
    }

    const isButton = d.kind === 'button';
    const collection = isButton ? SectionCollection : MenuItemCollection;
    const sourceSnap = await db.collection(collection).doc(sourceKey).get();
    const sourceDoc = sourceSnap.data() as DocData | undefined;
    const sourceName = isButton
      ? verifyButtonSource(sourceDoc, d.tenantId)
      : verifyMenuSource(sourceDoc, d.tenantId);
    if (!sourceName) {
      // Deliberately not a 404 vs 403 distinction: a caller probing for other tenants'
      // sections learns nothing from the answer either way.
      throw new HttpsError('permission-denied', `${collection}/${sourceKey} may not fire a workflow event`);
    }

    if (!(await claimCooldown(db, uid, sourceKey, Date.now()))) {
      // NOT an error: a member who double-taps must not see one. Nothing is emitted.
      logger.info(`${CF_NAME}: cooldown, skipped ${event} for ${sourceKey} (uid ${uid})`);
      return { skipped: 'cooldown' };
    }

    const personKey = str(user['personKey']);
    const personName = `${str(user['firstName'])} ${str(user['lastName'])}`.trim();
    const relatedKey = `uiEvent.${randomUUID()}`;

    await emitEvent(event, d.tenantId, relatedKey, {
      // the pressing member is the SUBJECT, so a rule with responsibilityKey 'subject'
      // reaches them, and the person-scoped probes (hasActiveOwnerships, hasOpenInvoices)
      // work unchanged
      personKey,
      subjectName: personName,
      params: {
        sourceName,                  // FROM THE DOCUMENT — see verifyButtonSource
        sourceKey,
        sourceType: isButton ? 'section' : 'menuItem',
        personKey,
        personName,
        linkKey: str(d.linkKey),
        notes: str(d.notes),
      },
    });

    logger.info(`${CF_NAME}: emitted ${event} (${relatedKey}) for '${sourceName}' of tenant ${d.tenantId}`);
    return { event, relatedKey };
  },
);

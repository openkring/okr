// apps/functions/src/email/mailing-deliveries.ts
//
// `getMailingDeliveries` (callable): what became of each E-Mail of one Versand, for the Versand overview
// (MailingPage). It reads the Mailtrap events of the Versand's category from `emailEvents`, which the rules
// keep for the operator only; this callable is the narrow way through for the tenant's memberAdmin /
// privileged, the same people the `mailings` rule lets read the Versand. The rule itself stays closed.
//
// Matching and privacy: see mailing-deliveries.logic.ts. The events live 30 days (the webhook's TTL), and
// only a Versand sent after the category was introduced has any.

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { DeliveryChannel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { bareAddress } from '../auth/email-templates';
import { MailJobCollection } from './mail-job';
import { directoryEmailsByKey, keysFor, MailingCollection, type MailingDelivery } from './mailing';
import { deliveriesByAddress, joinDeliveries, mailingCategory, type EmailEventRow, type MailingDeliveriesResult } from './mailing-deliveries.logic';
import { isElevated } from './mailing-recipients';

const REGION = 'europe-west6';
const CF_NAME = 'getMailingDeliveries';
/** 3000 recipients (sendMailing's cap) times a few events each; more is cut off and logged. */
const MAX_EVENTS = 20000;

interface MailingDeliveriesDoc {
  tenants?: string[];
  deliveries?: MailingDelivery[];
  to?: string[];
  cc?: string[];
  from?: string;
  mailJobKey?: string;
}

/** Whether the caller may follow this Versand: memberAdmin / privileged / admin of its tenant (the `mailings` read rule). */
export function mayReadMailingDeliveries(mailing: Pick<MailingDeliveriesDoc, 'tenants'>, caller: { tenants?: string[]; roles?: unknown }): boolean {
  const tenant = mailing.tenants?.length === 1 ? mailing.tenants[0] : '';
  return !!tenant && (caller.tenants ?? []).includes(tenant) && isElevated(caller.roles);
}

export const getMailingDeliveries = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB' },
  async (request: CallableRequest<{ mailingKey: string }>): Promise<MailingDeliveriesResult & { truncated?: boolean }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const mailingKey = request.data?.mailingKey;
    if (typeof mailingKey !== 'string' || !mailingKey || mailingKey.includes('/')) {
      throw new HttpsError('invalid-argument', 'mailingKey is required.');
    }
    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const [mailingSnap, callerSnap] = await Promise.all([
      db.collection(MailingCollection).doc(mailingKey).get(),
      db.collection('users').doc(uid).get(),
    ]);
    const mailing = mailingSnap.data() as MailingDeliveriesDoc | undefined;
    if (!mailing || !mayReadMailingDeliveries(mailing, (callerSnap.data() ?? {}) as { tenants?: string[]; roles?: unknown })) {
      throw new HttpsError('permission-denied', 'This Versand is not available.');
    }
    const tenantId = mailing.tenants?.[0] ?? '';
    const emailKeys = keysFor(mailing.deliveries ?? [], DeliveryChannel.Email);
    if (emailKeys.length === 0) return { recipients: [], addresses: [], unmatched: 0 };

    const [eventsSnap, jobSnap, emailByKey] = await Promise.all([
      db.collection('emailEvents').where('category', '==', mailingCategory(mailingKey))
        .select('event', 'email', 'timestamp', 'reason', 'bounce_category', 'response').limit(MAX_EVENTS).get(),
      mailing.mailJobKey ? db.collection(MailJobCollection).doc(mailing.mailJobKey).get() : Promise.resolve(undefined),
      directoryEmailsByKey(db, tenantId, emailKeys),
    ]);
    const job = jobSnap?.data() as { from?: string; to?: string[]; cc?: string[] } | undefined;
    // the addresses the caller already sees on the mailings / mailJobs docs: To, Cc, and the sender,
    // who is the To of every Bcc block after the first (mailJobBlocks)
    const visible = [...(mailing.to ?? []), ...(mailing.cc ?? []), ...(job?.to ?? []), ...(job?.cc ?? []),
      ...[mailing.from, job?.from].filter((f): f is string => !!f).map(bareAddress)];
    const result = joinDeliveries(deliveriesByAddress(eventsSnap.docs.map((d) => d.data() as EmailEventRow)), emailByKey, visible);
    // counts only: never an address in the log (privacy inventory §7.2)
    const truncated = eventsSnap.size >= MAX_EVENTS;
    if (truncated) logger.warn(`${CF_NAME}: Versand ${mailingKey} has more than ${MAX_EVENTS} events, the rest is left out`);
    return { ...result, ...(truncated ? { truncated } : {}) };
  },
);

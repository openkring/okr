// apps/functions/src/email/mailing-recipients.ts
//
// The Zustellung table of a Versand (spec 1.144 §5): for each recipient, which delivery types are
// possible and which the profile picks. The client cannot answer that itself — it may not read other
// members' `users` docs (newsDelivery) nor their raw addresses — so this callable reads both with the
// Admin SDK and hands back booleans and channel names only, never an address value (privacy-model).
//
// Who may ask: memberAdmin / privileged / admin of the tenant, or an admin of `groupKey`, who then
// only learns about the group's current members (the same boundary as sendGroupEmail).

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DateFormat, getTodayStr, MailingRecipientChannels, MailingRecipientFacts, mailingChannels } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { assertCallerIsGroupAdmin } from '../content/group-content.util';
import { selectUserDocs } from '../srv/push';
import { activeMemberKeys, MembershipDoc } from './group-mail';

const REGION = 'europe-west6';
const CF_NAME = 'getMailingRecipients';
/** Firestore's `in` filter takes at most 30 values. */
const IN_CHUNK = 30;
/** A Versand to more persons than this is refused rather than read half-way. */
const MAX_RECIPIENTS = 3000;

export interface MailingRecipientsRequest {
  tenantId: string;
  personKeys: string[];
  /** Set by a group admin: the answer is limited to the group's members. */
  groupKey?: string;
}

const ELEVATED_ROLES = ['admin', 'privileged', 'memberAdmin'];

/** Whether a `users` doc's roles let it see the whole tenant's Zustellung. */
export function isElevated(roles: unknown): boolean {
  const map = (roles ?? {}) as Record<string, unknown>;
  return ELEVATED_ROLES.some((role) => map[role] === true);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Each requested key once, non-empty, and — for a group admin — only the group's members. */
export function admissibleKeys(requested: string[], members?: string[]): string[] {
  const allowed = members ? new Set(members) : undefined;
  return [...new Set(requested.filter((key) => key.length > 0 && (!allowed || allowed.has(key))))];
}

async function readFacts(db: Firestore, tenantId: string, personKeys: string[]): Promise<MailingRecipientFacts[]> {
  const accounts = new Map<string, { uid: string; tenants?: string[]; isArchived?: boolean; newsDelivery?: unknown }[]>();
  const postal = new Set<string>();
  for (const keys of chunk(personKeys, IN_CHUNK)) {
    const [users, addresses] = await Promise.all([
      db.collection('users').where('personKey', 'in', keys).get(),
      db.collection('addresses')
        .where('parentKey', 'in', keys.map((key) => `person.${key}`))
        .where('addressChannel', '==', 'postal').get(),
    ]);
    for (const doc of users.docs) {
      const data = doc.data();
      const key = String(data['personKey'] ?? '');
      accounts.set(key, [...(accounts.get(key) ?? []), { uid: doc.id, ...data }]);
    }
    for (const doc of addresses.docs) {
      const data = doc.data();
      if (data['isArchived'] === true || !((data['tenants'] ?? []) as string[]).includes(tenantId)) continue;
      postal.add(String(data['parentKey'] ?? '').replace(/^person\./, ''));
    }
  }
  // email: the favourite in the directory projection, which is also what the composer sends to
  const directory = await db.getAll(...personKeys.map((key) => db.collection('address-directory').doc(`${tenantId}_person.${key}`)));
  const hasEmail = new Set(directory.filter((snap) => String(snap.data()?.['favEmail'] ?? '').length > 0)
    .map((snap) => String(snap.data()?.['parentKey'] ?? '').replace(/^person\./, '')));

  return personKeys.map((personKey) => {
    const [account] = selectUserDocs(accounts.get(personKey) ?? [], tenantId) as { newsDelivery?: unknown }[];
    return {
      personKey,
      hasAccount: !!account,
      newsDelivery: account?.newsDelivery,
      hasEmail: hasEmail.has(personKey),
      hasPostal: postal.has(personKey),
    };
  });
}

export const getMailingRecipients = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB', timeoutSeconds: 120 },
  async (request: CallableRequest<MailingRecipientsRequest>): Promise<{ recipients: MailingRecipientChannels[] }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const { tenantId, personKeys, groupKey } = request.data ?? {};
    if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('invalid-argument', 'tenantId is required.');
    if (!Array.isArray(personKeys) || personKeys.some((key) => typeof key !== 'string')) {
      throw new HttpsError('invalid-argument', 'personKeys must be a list of strings.');
    }
    if (personKeys.length > MAX_RECIPIENTS) throw new HttpsError('invalid-argument', `At most ${MAX_RECIPIENTS} recipients.`);

    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const caller = (await db.collection('users').doc(uid).get()).data();
    let members: string[] | undefined;
    if (isElevated(caller?.['roles']) && ((caller?.['tenants'] ?? []) as string[]).includes(tenantId)) {
      members = undefined;
    } else if (typeof groupKey === 'string' && groupKey) {
      await assertCallerIsGroupAdmin(db, uid, tenantId, groupKey, 'Only an admin of the group may prepare a Versand to its members.');
      const memberships = await db.collection('memberships')
        .where('orgKey', '==', groupKey).where('orgModelType', '==', 'group').get();
      members = activeMemberKeys(memberships.docs.map((doc) => doc.data() as MembershipDoc), tenantId, getTodayStr(DateFormat.StoreDate));
    } else {
      throw new HttpsError('permission-denied', 'This operation requires the memberAdmin or privileged role.');
    }

    const keys = admissibleKeys(personKeys, members);
    const recipients = keys.length === 0 ? [] : (await readFacts(db, tenantId, keys)).map(mailingChannels);
    logger.info(`${CF_NAME}: ${recipients.length} recipient(s) resolved (tenant ${tenantId})`);
    return { recipients };
  },
);

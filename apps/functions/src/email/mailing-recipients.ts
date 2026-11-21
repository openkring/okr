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
import { HouseholdBundle, HouseholdCollection } from '@okr/shared-models';
import {
  DateFormat, getTodayStr, isOrgRecipient, readBundle, residenceStatus, MailingHousehold, MailingRecipientChannels, MailingRecipientFacts,
  mailingChannels, recipientParentKey, zurichStoreDate,
} from '@okr/shared-util-core';
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

/**
 * The facts per recipient key — a bare person okey or `org.<okey>` (see `recipientParentKey`). An org
 * has no account: only its email and postal address count.
 */
async function readFacts(db: Firestore, tenantId: string, recipientKeys: string[]): Promise<MailingRecipientFacts[]> {
  const accounts = new Map<string, { uid: string; tenants?: string[]; isArchived?: boolean; newsDelivery?: unknown }[]>();
  const postal = new Set<string>();      // parentKeys with a postal address in the tenant
  const today = zurichStoreDate();
  for (const keys of chunk(recipientKeys, IN_CHUNK)) {
    const personKeys = keys.filter((key) => !isOrgRecipient(key));
    const [users, addresses] = await Promise.all([
      personKeys.length > 0 ? db.collection('users').where('personKey', 'in', personKeys).get() : undefined,
      db.collection('addresses')
        .where('parentKey', 'in', keys.map(recipientParentKey))
        .where('addressChannel', '==', 'postal').get(),
    ]);
    for (const doc of users?.docs ?? []) {
      const data = doc.data();
      const key = String(data['personKey'] ?? '');
      accounts.set(key, [...(accounts.get(key) ?? []), { uid: doc.id, ...data }]);
    }
    for (const doc of addresses.docs) {
      const data = doc.data();
      if (data['isArchived'] === true || !((data['tenants'] ?? []) as string[]).includes(tenantId)) continue;
      // a past or future residence is not a postal address to write to today (spec 1.164 §7.3)
      if (residenceStatus({ validFrom: String(data['validFrom'] ?? ''), validTo: String(data['validTo'] ?? '') }, today) !== 'current') continue;
      postal.add(String(data['parentKey'] ?? ''));
    }
  }
  // email: the favourite in the directory projection, which is also what the composer sends to
  const directory = await db.getAll(...recipientKeys.map((key) => db.collection('address-directory').doc(`${tenantId}_${recipientParentKey(key)}`)));
  const hasEmail = new Set(recipientKeys.filter((_, i) => String(directory[i].data()?.['favEmail'] ?? '').length > 0));

  return recipientKeys.map((personKey) => {
    if (isOrgRecipient(personKey)) {
      return { personKey, hasAccount: false, hasEmail: hasEmail.has(personKey), hasPostal: postal.has(personKey) };
    }
    const [account] = selectUserDocs(accounts.get(personKey) ?? [], tenantId) as { newsDelivery?: unknown }[];
    return {
      personKey,
      hasAccount: !!account,
      newsDelivery: account?.newsDelivery,
      hasEmail: hasEmail.has(personKey),
      hasPostal: postal.has(recipientParentKey(personKey)),
    };
  });
}

/** A household doc that touches a Versand, already checked (see `touchingHouseholds`). */
export interface TouchingHousehold {
  okey: string;
  name: string;
  contactKey: string;
  memberKeys: string[];
  bundle: HouseholdBundle;
}

/** The keys a household lookup may use: persons only, never `org.<okey>`. */
export function householdLookupKeys(keys: string[]): string[] {
  return keys.filter((key) => !isOrgRecipient(key));
}

/**
 * The households of a Versand (spec 1.168 §6.1): active, of this tenant only (`tenants` exactly
 * `[tenantId]`), with at least one requested key, and with a contact among the members. Each once.
 */
export function touchingHouseholds(docs: { okey: string; data: Record<string, unknown> }[], tenantId: string, requested: string[]): TouchingHousehold[] {
  const wanted = new Set(requested);
  const seen = new Set<string>();
  const out: TouchingHousehold[] = [];
  for (const { okey, data } of docs) {
    if (seen.has(okey) || data['isArchived'] === true) continue;
    const tenants = (data['tenants'] ?? []) as string[];
    if (tenants.length !== 1 || tenants[0] !== tenantId) continue;
    const memberKeys = ((data['memberKeys'] ?? []) as unknown[]).map(String);
    const contactKey = String(data['contactKey'] ?? '');
    if (!memberKeys.some((key) => wanted.has(key))) continue;
    if (!contactKey || !memberKeys.includes(contactKey)) continue;
    seen.add(okey);
    out.push({ okey, name: String(data['name'] ?? ''), contactKey, memberKeys, bundle: readBundle(data as never) });
  }
  return out;
}

/** The contacts whose facts are not read yet: not among the requested keys. Each once. */
export function contactKeysToRead(households: TouchingHousehold[], requested: string[]): string[] {
  const have = new Set(requested);
  return [...new Set(households.map((h) => h.contactKey).filter((key) => !have.has(key)))];
}

/** The households as the composer gets them: the contact's delivery types and name, never an address. */
export function buildMailingHouseholds(
  households: TouchingHousehold[],
  facts: MailingRecipientFacts[],
  names: Record<string, { firstName?: string; lastName?: string }>,
): MailingHousehold[] {
  const byKey = new Map(facts.map((f) => [f.personKey, f]));
  const out: MailingHousehold[] = [];
  for (const h of households) {
    const contactFacts = byKey.get(h.contactKey);
    if (!contactFacts) continue;
    const name = names[h.contactKey];
    out.push({
      okey: h.okey, name: h.name, contactKey: h.contactKey,
      contactName: [name?.firstName, name?.lastName].filter((part) => !!part).join(' '),
      memberKeys: h.memberKeys, bundle: h.bundle, contact: mailingChannels(contactFacts),
    });
  }
  return out;
}

/** Reads the households touching the keys, and their contacts' delivery types and names. */
async function readHouseholds(db: Firestore, tenantId: string, keys: string[], facts: MailingRecipientFacts[]): Promise<MailingHousehold[]> {
  const lookup = householdLookupKeys(keys);
  const docs: { okey: string; data: Record<string, unknown> }[] = [];
  for (const part of chunk(lookup, IN_CHUNK)) {
    const snap = await db.collection(HouseholdCollection).where('memberKeys', 'array-contains-any', part).get();
    for (const doc of snap.docs) docs.push({ okey: doc.id, data: doc.data() });
  }
  const households = touchingHouseholds(docs, tenantId, lookup);
  if (households.length === 0) return [];
  const extra = contactKeysToRead(households, keys);
  const allFacts = extra.length > 0 ? [...facts, ...await readFacts(db, tenantId, extra)] : facts;
  const contactKeys = [...new Set(households.map((h) => h.contactKey))];
  const persons = await db.getAll(...contactKeys.map((key) => db.collection('persons').doc(key)));
  const names: Record<string, { firstName?: string; lastName?: string }> = {};
  persons.forEach((snap, i) => {
    const data = snap.data();
    names[contactKeys[i]] = { firstName: String(data?.['firstName'] ?? ''), lastName: String(data?.['lastName'] ?? '') };
  });
  return buildMailingHouseholds(households, allFacts, names);
}

export const getMailingRecipients = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB', timeoutSeconds: 120 },
  async (request: CallableRequest<MailingRecipientsRequest>): Promise<{ recipients: MailingRecipientChannels[]; households: MailingHousehold[] }> => {
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
    const facts = keys.length === 0 ? [] : await readFacts(db, tenantId, keys);
    const recipients = facts.map(mailingChannels);
    // households (spec 1.168 §6.1): only for the admitted keys, so a group admin learns about the group's members only
    const households = keys.length === 0 ? [] : await readHouseholds(db, tenantId, keys, facts);
    logger.info(`${CF_NAME}: ${recipients.length} recipient(s), ${households.length} household(s) resolved (tenant ${tenantId})`);
    return { recipients, households };
  },
);

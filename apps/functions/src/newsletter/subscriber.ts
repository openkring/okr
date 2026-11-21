/**
 * Match-or-create for newsletter subscribers (spec 1.169 §5.3, §5.7 import): turns a confirmed sign-up or
 * an import row into a person + subscription. Matching is by email inside the tenant only (D-L1): an
 * address counts only when its own `tenants[]` contains the tenant. An existing person and its addresses
 * are never changed. Member admins get a task when the typed name differs or when the email is ambiguous.
 */
import { logger } from 'firebase-functions/v2';
import type { DocumentData, Firestore, Transaction } from 'firebase-admin/firestore';

import {
  AddressCollection, AddressModel, AvatarInfo, NewsletterSource, NewsletterSubscriptionCollection,
  NewsletterSubscriptionModel, PersonCollection, PersonModel, TaskCollection, TaskModel,
} from '@okr/shared-models';
import { addIndexElement, getFullName } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/project-task-util';
import { getMemberAdminPersons } from '@okr/shared-util-functions';

import { SYSTEM_AUTHOR } from '../workflow/activity';
import {
  AMBIGUOUS_TASK_NAME, ambiguousTaskNotes, decideMatch, MatchCandidate, NAME_DIFFERS_TASK_NAME, nameDiffersTaskNotes,
  NEWSLETTER_TASK_TAG, normalizeEmail, SubscriberTaskKind, subscriberTaskId,
} from './subscriber.logic';

export interface SubscribeInput {
  tenantId: string;
  /** FK -> groups (kind 'newsletter') */
  groupKey: string;
  groupName: string;
  firstName: string;
  lastName: string;
  email: string;
  /** '' = none; otherwise stored as a postal address with only the city on a NEW person */
  city: string;
  source: NewsletterSource;
  formKey?: string;
  /** StoreDateTime of the double-opt-in confirmation */
  confirmedAt?: string;
  importOptinAt?: string;
  importConfirmAt?: string;
  /** StoreDate */
  dateOfEntry: string;
}

export type SubscribeResult = 'subscribed' | 'alreadySubscribed' | 'ambiguous';

/** What the transaction found out; the tasks are written after it. Names only, never an address. */
type Outcome =
  | { result: 'subscribed' | 'alreadySubscribed'; nameDiffers?: { personKey: string; personName: string } }
  | { result: 'ambiguous'; candidateNames: string[] };

const PERSON_PREFIX = 'person.';

/** Without `okey` (the document id) and without undefined fields (Firestore rejects them). */
function toDoc<T extends { okey: string }>(model: T): DocumentData {
  return Object.fromEntries(Object.entries(model).filter(([k, v]) => k !== 'okey' && v !== undefined));
}

/** Mirror of getPersonIndex (subject-person-util reaches Angular) — keep field order in sync. */
function personIndex(p: PersonModel): string {
  let index = '';
  index = addIndexElement(index, 'n', p.lastName);
  index = addIndexElement(index, 'z', p.favZipCode);
  index = addIndexElement(index, 'fn', p.firstName);
  index = addIndexElement(index, 'bx', p.bexioId);
  index = addIndexElement(index, 'nn', p.nickname ?? '');
  index = addIndexElement(index, 'mn', p.maidenName ?? '');
  return index;
}

/** Mirror of getAddressIndex (subject-address-util reaches Angular) for the email and postal channels. */
function addressIndex(a: AddressModel, ownerName: string): string {
  const value = a.addressChannel === 'email'
    ? a.email
    : `${a.streetName}${a.streetNumber}${a.countryCode}${a.zipCode}${a.city}`;
  return `n:${value} p:${a.parentKey} o:${ownerName.trim()}`;
}

function newAddress(tenantId: string, parentKey: string, ownerName: string, patch: Partial<AddressModel>): DocumentData {
  const a = Object.assign(new AddressModel(tenantId), { parentKey, isFavorite: true, isArchived: false, tenants: [tenantId] }, patch);
  a.index = addressIndex(a, ownerName);
  return toDoc(a);
}

/** The person's addresses of the tenant with this email, with the person's name; archived or foreign rows skipped. */
async function readCandidates(db: Firestore, tx: Transaction, tenantId: string, email: string): Promise<MatchCandidate[]> {
  const snap = await tx.get(db.collection(AddressCollection).where('addressChannel', '==', 'email').where('email', '==', email));
  const hits = snap.docs.map((d) => d.data())
    .filter((a) => a['isArchived'] !== true && Array.isArray(a['tenants']) && (a['tenants'] as string[]).includes(tenantId))
    .filter((a) => typeof a['parentKey'] === 'string' && (a['parentKey'] as string).startsWith(PERSON_PREFIX));
  const keys = [...new Set(hits.map((a) => (a['parentKey'] as string).substring(PERSON_PREFIX.length)))].filter((k) => k !== '');
  const persons = new Map<string, DocumentData>();
  for (const key of keys) {
    const p = await tx.get(db.collection(PersonCollection).doc(key));
    const data = p.data();
    if (p.exists && data && data['isArchived'] !== true) persons.set(key, data);
  }
  return hits.flatMap((a) => {
    const personKey = (a['parentKey'] as string).substring(PERSON_PREFIX.length);
    const p = persons.get(personKey);
    if (!p) return [];
    return [{ personKey, isFavorite: a['isFavorite'] === true, firstName: String(p['firstName'] ?? ''), lastName: String(p['lastName'] ?? '') }];
  });
}

async function hasActiveSubscription(db: Firestore, tx: Transaction, tenantId: string, personKey: string, groupKey: string): Promise<boolean> {
  const snap = await tx.get(db.collection(NewsletterSubscriptionCollection)
    .where('tenants', 'array-contains', tenantId)
    .where('personKey', '==', personKey)
    .where('groupKey', '==', groupKey));
  return snap.docs.some((d) => d.data()['isArchived'] !== true && (d.data()['dateOfExit'] ?? '') === '');
}

function subscriptionDoc(input: SubscribeInput, personKey: string, personName: string): DocumentData {
  const s = new NewsletterSubscriptionModel(input.tenantId);
  s.personKey = personKey;
  s.personName = personName;
  s.groupKey = input.groupKey;
  s.groupName = input.groupName;
  s.dateOfEntry = input.dateOfEntry;
  s.source = input.source;
  s.formKey = input.formKey ?? '';
  s.confirmedAt = input.confirmedAt ?? '';
  s.importOptinAt = input.importOptinAt ?? '';
  s.importConfirmAt = input.importConfirmAt ?? '';
  s.index = addIndexElement(addIndexElement('', 'n', personName), 'g', input.groupName);
  return toDoc(s);
}

/**
 * Subscribes the person with this email to the newsletter `groupKey` of `tenantId`, in one transaction
 * (all reads before the writes): match by email inside the tenant, else create the person with a
 * favourite email and (if given) a postal address with only the city; then the subscription unless an
 * active one exists. Ambiguous → nothing is written, the member admins get a task.
 */
export async function subscribePerson(db: Firestore, input: SubscribeInput): Promise<SubscribeResult> {
  const email = normalizeEmail(input.email);
  if (!email || !input.tenantId || !input.groupKey) throw new Error('subscribePerson: tenantId, groupKey and email are required');
  const typed = { firstName: input.firstName.trim(), lastName: input.lastName.trim() };
  const city = input.city.trim();

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const candidates = await readCandidates(db, tx, input.tenantId, email);
    const decision = decideMatch(candidates, typed);

    if (decision.kind === 'ambiguous') {
      const names = decision.personKeys.map((k) => {
        const c = candidates.find((x) => x.personKey === k);
        return getFullName(c?.firstName, c?.lastName);
      });
      return { result: 'ambiguous', candidateNames: names };
    }

    if (decision.kind === 'existing') {
      const c = candidates.find((x) => x.personKey === decision.personKey);
      const personName = getFullName(c?.firstName, c?.lastName);
      const nameDiffers = decision.nameDiffers ? { personKey: decision.personKey, personName } : undefined;
      if (await hasActiveSubscription(db, tx, input.tenantId, decision.personKey, input.groupKey)) {
        return { result: 'alreadySubscribed', nameDiffers };
      }
      tx.create(db.collection(NewsletterSubscriptionCollection).doc(), subscriptionDoc(input, decision.personKey, personName));
      return { result: 'subscribed', nameDiffers };
    }

    // create: a new person of this tenant only, with its favourite email (and city)
    const personRef = db.collection(PersonCollection).doc();
    const person = new PersonModel(input.tenantId);
    person.firstName = typed.firstName;
    person.lastName = typed.lastName;
    person.tenants = [input.tenantId];
    person.index = personIndex(person);
    const personName = getFullName(person.firstName, person.lastName);
    const parentKey = `${PERSON_PREFIX}${personRef.id}`;
    tx.create(personRef, toDoc(person));
    tx.create(db.collection(AddressCollection).doc(), newAddress(input.tenantId, parentKey, personName, { addressChannel: 'email', email }));
    if (city) {
      // a new person has no other postal address, so this one is the favourite
      tx.create(db.collection(AddressCollection).doc(), newAddress(input.tenantId, parentKey, personName, { addressChannel: 'postal', city }));
    }
    tx.create(db.collection(NewsletterSubscriptionCollection).doc(), subscriptionDoc(input, personRef.id, personName));
    return { result: 'subscribed' };
  });

  const typedName = getFullName(typed.firstName, typed.lastName);
  if (outcome.result === 'ambiguous') {
    await notifyMemberAdmins(db, input, email, 'ambiguous', {
      name: AMBIGUOUS_TASK_NAME,
      notes: ambiguousTaskNotes(typedName, outcome.candidateNames, input.groupName),
      relatedModelType: 'group',
      relatedKey: `group.${input.groupKey}`,
    });
  } else if (outcome.nameDiffers) {
    await notifyMemberAdmins(db, input, email, 'nameDiffers', {
      name: NAME_DIFFERS_TASK_NAME,
      notes: nameDiffersTaskNotes(typedName, outcome.nameDiffers.personName, input.groupName),
      relatedModelType: 'person',
      relatedKey: `${PERSON_PREFIX}${outcome.nameDiffers.personKey}`,
    });
  }
  // no email and no name in the log (PII)
  logger.info(`newsletter subscriber: ${outcome.result} in ${input.tenantId}/${input.groupKey}`);
  return outcome.result;
}

interface TaskText {
  name: string;
  notes: string;
  relatedModelType: string;
  relatedKey: string;
}

export function subscriberTask(tenantId: string, assignee: AvatarInfo, text: TaskText): DocumentData {
  const task = new TaskModel(tenantId);
  task.name = text.name;
  task.notes = text.notes;
  task.tags = NEWSLETTER_TASK_TAG;
  task.author = SYSTEM_AUTHOR;
  task.assignee = assignee;
  task.relatedModelType = text.relatedModelType;
  task.relatedKey = text.relatedKey;
  task.index = getTaskIndex(task);
  return toDoc(task);
}

/** One task per member admin, deterministic id. Never throws: the subscription itself is already decided. */
async function notifyMemberAdmins(db: Firestore, input: SubscribeInput, email: string, kind: SubscriberTaskKind, text: TaskText): Promise<void> {
  try {
    const admins = await getMemberAdminPersons(db, input.tenantId);
    if (admins.length === 0) {
      logger.warn(`newsletter subscriber: tenant ${input.tenantId} has no memberAdmin, no ${kind} task`);
      return;
    }
    for (const admin of admins) {
      const id = subscriberTaskId({ tenantId: input.tenantId, groupKey: input.groupKey, email, kind, adminKey: admin.key });
      try {
        await db.collection(TaskCollection).doc(id).create(subscriberTask(input.tenantId, admin, text));
      } catch (err) {
        if ((err as { code?: number }).code !== 6) throw err;   // 6 = ALREADY_EXISTS: the same sign-up again
      }
    }
  } catch (err) {
    logger.error(`newsletter subscriber: ${kind} task for ${input.tenantId}/${input.groupKey} failed`, err);
  }
}

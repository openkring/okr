// apps/functions/src/email/household-recipient.logic.ts
//
// A household as a Versand recipient (spec 1.168 §6.3). The composer replaces the members of a household on a
// bundled channel with one key `household.<okey>`; the server never trusts that grouping. Every household key is
// loaded and resolved here: only a live household of exactly this tenant whose contact is a member is delivered,
// to its contact. Anything else is dropped and logged (mailing key and household key, never a name).
//
// E-Mail and In-App reach the contact as a person (the household key becomes the contact's personKey); Post keeps
// the household key, so the letter and its `sendings` record carry the household name.

import type { Firestore } from 'firebase-admin/firestore';
import { HouseholdCollection, type HouseholdModel } from '@okr/shared-models';
import { isHouseholdRecipient, recipientParentKey } from '@okr/shared-util-core';

/** What a Versand needs of a household: who receives it, and the name it is addressed to. No address. */
export interface HouseholdRecipient {
  contactKey: string;
  name: string;
}

/** A delivery as stored on the `mailings` doc (kept structural, so this file does not import mailing.ts). */
interface Delivery {
  personKey: string;
  channels: string[];
}

/**
 * The recipient of a household doc, or undefined when it must not be delivered: missing, archived, not exactly
 * `[tenantId]`, without a name, or with a contact that is not a member.
 */
export function resolveHouseholdRecipient(doc: Partial<HouseholdModel> | undefined, tenantId: string): HouseholdRecipient | undefined {
  if (!doc || doc.isArchived === true) return undefined;
  const tenants = Array.isArray(doc.tenants) ? doc.tenants : [];
  if (tenants.length !== 1 || tenants[0] !== tenantId) return undefined;
  const contactKey = typeof doc.contactKey === 'string' ? doc.contactKey : '';
  const members = Array.isArray(doc.memberKeys) ? doc.memberKeys : [];
  if (!contactKey || !members.includes(contactKey)) return undefined;
  const name = typeof doc.name === 'string' ? doc.name.trim() : '';
  if (!name) return undefined;
  return { contactKey, name };
}

/**
 * Loads and resolves every household key among `keys` (other keys are ignored). A key that does not resolve is
 * missing from the map and logged with `context` (the mailing key); callers drop it.
 */
export async function loadHouseholdRecipients(db: Firestore, tenantId: string, keys: string[], context: string): Promise<Map<string, HouseholdRecipient>> {
  const out = new Map<string, HouseholdRecipient>();
  const householdKeys = [...new Set(keys.filter(isHouseholdRecipient))];
  if (householdKeys.length === 0) return out;
  const refs = householdKeys.map((key) => db.collection(HouseholdCollection).doc(key.slice(key.indexOf('.') + 1)));
  const snaps = await db.getAll(...refs);
  snaps.forEach((snap, i) => {
    const resolved = resolveHouseholdRecipient(snap.data() as Partial<HouseholdModel> | undefined, tenantId);
    if (resolved) out.set(householdKeys[i], resolved);
    else console.warn(`household recipient dropped (${context}): missing, archived, foreign or without a member contact`, { context, householdKey: householdKeys[i] });
  });
  return out;
}

/**
 * The person (and org) keys a channel reaches: a household key becomes its contact, an unresolved one is dropped,
 * and each key is kept once (a contact also ticked on their own gets one mail / one notice).
 */
export function contactKeysFor(deliveries: Delivery[], channel: string, households: Map<string, HouseholdRecipient>): string[] {
  const out = new Set<string>();
  for (const d of deliveries) {
    if (!d.channels.includes(channel)) continue;
    const key = answerKeyOf(d.personKey, households);
    if (key) out.add(key);
  }
  return [...out];
}

/**
 * The Post keys: a resolved household keeps its key (its letter names the household), an unresolved one is
 * dropped, and a contact ticked on their own beside their household's letter gets no second letter.
 */
export function postKeysFor(deliveries: Delivery[], households: Map<string, HouseholdRecipient>): string[] {
  const post = deliveries.filter((d) => d.channels.includes('post')).map((d) => d.personKey);
  const covered = new Set(post.filter((key) => households.has(key)).map((key) => households.get(key)?.contactKey));
  return [...new Set(post.filter((key) => (isHouseholdRecipient(key) ? households.has(key) : !covered.has(key))))];
}

/** The person a delivery key stands for: the contact of a household key (undefined when unresolved), else the key. */
export function answerKeyOf(key: string, households: Map<string, HouseholdRecipient>): string | undefined {
  return isHouseholdRecipient(key) ? households.get(key)?.contactKey : key;
}

/**
 * The address `parentKey` a delivery key is reached at: a household's contact (`person.<contactKey>`, undefined
 * when unresolved), else the key's own (`recipientParentKey`).
 */
export function addressParentKeyOf(key: string, households: Map<string, HouseholdRecipient>): string | undefined {
  if (!isHouseholdRecipient(key)) return recipientParentKey(key);
  const contactKey = households.get(key)?.contactKey;
  return contactKey ? `person.${contactKey}` : undefined;
}

/**
 * The deliveries without any household key, for a caller who may not address households (a group admin, see
 * householdsForCaller). Each dropped key is logged with the mailing key.
 */
export function dropHouseholdKeys<T extends Delivery>(deliveries: T[], context: string): T[] {
  return deliveries.filter((d) => {
    if (!isHouseholdRecipient(d.personKey)) return true;
    console.warn(`household recipient dropped (${context}): the sender may not address households`, { context, householdKey: d.personKey });
    return false;
  });
}

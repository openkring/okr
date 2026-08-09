// apps/functions/src/business/prospect.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { AddressCollection, PartnerCollection, ProspectCollection } from '@okr/shared-models';
import type { AddressModel, PartnerModel, ProspectModel } from '@okr/shared-models';
import {
  claimProspect as applyClaim, isVisibleToPartner, releaseClaim, revokeConsent,
} from '@okr/business-prospect-util';

import { PLATFORM_TENANT, REGION, nowStamp, requireAdmin, requirePartner } from './shared';

/**
 * C5 §5 — the partner-facing half of the prospect pool.
 *
 * **Why callables and not `firestore.rules`.** The access rule is "the open pool, plus my own
 * claims, never another partner's" — a predicate over the CONTENT of each document. Firestore
 * cannot evaluate a content-dependent rule for a *list* query: it either rejects the query
 * outright, or the rule is written loosely enough to pass and then grants more than it reads
 * like it grants. So `prospects` is admin-read-only in the rules, and a partner reaches it only
 * through these four functions, authenticated by `PartnerModel.serviceUid` — no `partner` role,
 * nothing added to the eight billable roles, nothing added to `isPrivileged()`.
 *
 * **What a partner may see of a person.** An open pool entry carries the Verein's name, its
 * segment and where the lead came from — and no contact data at all. The contact details are
 * released *on claim*, because claiming is what makes the disclosure to that partner lawful
 * (C5 §4: passing a prospect to a partner is a third-party transfer). A pool that handed out
 * e-mail addresses to every partner just for looking would be that transfer without the claim.
 */

/** One row as a partner sees it. Contact fields are present only for that partner's own claims. */
interface PoolRow {
  okey: string;
  name: string;
  segment: string;
  source: string;
  status: string;
  /** True when the caller holds this lead — i.e. when the contact fields below are filled. */
  isMine: boolean;
  claimExpiresAt: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

const db = () => getFirestore();

/**
 * C5 §2/§5 — the ONLY writer of a prospect, and the reason there is one.
 *
 * A prospect is **two writes**: the record, and its contact details as `AddressModel`s under
 * `parentKey = 'prospect.<okey>'`. The form builder's generic `SubmissionTargetCollection` path
 * writes exactly one document into one collection — which is all `applications` needs, because an
 * application keeps the applicant's e-mail as a plain field. A prospect deliberately does not
 * (see the `prospect.model.ts` class comment), so the builder cannot be the writer: it would
 * either drop the e-mail into a loose field on `prospects` — the one thing C5 §5 forbids — or
 * grow a second copy of this logic beside `submitProspect`.
 *
 * So both front doors call in here instead: `submitProspect` (App Check, direct callable) and
 * `submitForm` for the `prospects.*` mappings. Consent lives here for the same reason — it is the
 * legal basis (Vertragswerk Teil III.2) and the signup notice states the onward transfer to a
 * partner, so a submission without it must not be stored **by any caller**. A checkbox that
 * arrives as `false` passes the builder's required-field check (`false` is neither undefined nor
 * `''`), which is precisely why this refusal cannot be delegated to the form definition.
 *
 * @returns the new prospect's okey.
 */
export async function createProspect(values: Record<string, unknown>): Promise<string> {
  // Anything that is not a string is not a contact datum — a file upload or an object arriving
  // under one of these keys is dropped, never stringified into '[object Object]'.
  const str = (key: string) => (typeof values[key] === 'string' ? (values[key] as string).trim() : '');
  const name = str('name');
  const email = str('email').toLowerCase();
  const phone = str('phone');
  if (name.length === 0 || email.length === 0) {
    throw new HttpsError('invalid-argument', 'name and email are required.');
  }
  const consent = values['consent'];
  if (consent !== true && consent !== 'true') {
    throw new HttpsError('failed-precondition', 'Consent is required.');
  }

  const at = nowStamp();
  const ref = db().collection(ProspectCollection).doc();
  const prospect: Omit<ProspectModel, 'okey'> = {
    tenants: [PLATFORM_TENANT],
    isArchived: false,
    name,
    index: `name:${name.toLowerCase()}`,
    tags: '',
    notes: '',
    segment: (str('segment') || 'club') as ProspectModel['segment'],
    contactName: str('contactName'),
    source: (str('source') || 'kring.ch').slice(0, 60),
    status: 'open',
    claimedByPartnerKey: '',
    claimedAt: '',
    claimExpiresAt: '',
    convertedTenantId: '',
    convertedAt: '',
    consentAt: at,
    revokedAt: '',
  };
  await ref.set(prospect);

  // Written raw rather than through `AddressService`: this is the Admin SDK, and the invariant that
  // service protects — at most one favorite per parent AND channel — cannot be violated by a
  // freshly created parent that has no other address of either channel.
  const address = (channel: 'email' | 'phone', value: Record<string, string>) => ({
    tenants: [PLATFORM_TENANT],
    isArchived: false,
    parentKey: `prospect.${ref.id}`,
    addressChannel: channel,
    label: 'signup',
    isFavorite: true,
    ...value,
  });
  await db().collection(AddressCollection).add(address('email', { email }));
  if (phone.length > 0) {
    await db().collection(AddressCollection).add(address('phone', { phone }));
  }

  logger.info(`createProspect: created ${ref.id} from ${prospect.source}`);
  return ref.id;
}

/** Firestore caps a disjunctive `in` at 30 values. */
function chunk<T>(items: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadProspect(okey: string): Promise<ProspectModel> {
  const snap = await db().collection(ProspectCollection).doc(okey).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such prospect.');
  return { ...(snap.data() as ProspectModel), okey: snap.id };
}

/**
 * The lead's contact data, for the partner who holds it.
 *
 * Read straight from `addresses` rather than through `getProjectedAddresses`: the projection and
 * the `address-directory` are the MEMBER directory, built around a person's `usage*` preferences
 * and a tenant's privacy floors, and a prospect is neither a member nor a person record. Its
 * legal basis is the consent given at signup, whose whole content is "you may pass this to a
 * partner" — so the claiming partner gets exactly what was collected, and nobody else gets any
 * of it (C5 §5, and the `prospect.model.ts` note on why there is no projection).
 */
async function contactsFor(prospectKeys: string[]): Promise<Map<string, { email: string; phone: string }>> {
  const out = new Map<string, { email: string; phone: string }>();
  if (prospectKeys.length === 0) return out;
  const parentKeys = prospectKeys.map((k) => `prospect.${k}`);
  const snaps = await Promise.all(chunk(parentKeys).map((keys) =>
    db().collection(AddressCollection).where('parentKey', 'in', keys).get()));
  for (const doc of snaps.flatMap((s) => s.docs)) {
    const address = doc.data() as AddressModel;
    if (address.isArchived) continue;
    const okey = String(address.parentKey ?? '').slice('prospect.'.length);
    const entry = out.get(okey) ?? { email: '', phone: '' };
    if (address.addressChannel === 'email' && address.email) entry.email = address.email;
    if (address.addressChannel === 'phone' && address.phone) entry.phone = address.phone;
    out.set(okey, entry);
  }
  return out;
}

async function poolFor(partner: PartnerModel): Promise<ProspectModel[]> {
  const snap = await db().collection(ProspectCollection)
    .where('tenants', 'array-contains', PLATFORM_TENANT).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as ProspectModel), okey: d.id }))
    .filter((p) => !p.isArchived && isVisibleToPartner(p, partner.okey));
}

/**
 * C5 §3 — the open pool plus this partner's own claims, never another partner's.
 *
 * The whole collection is read and filtered in memory rather than queried by status: the pool is
 * one tenant's leads, `isVisibleToPartner` also has to treat a *lapsed* claim as open (the expiry
 * is a fact about the date, not about whether a sweep has run), and expressing that as a query
 * would need a composite index plus a scheduled job to keep `status` honest. There is no sweep
 * for the same reason — an expired claim is already back in the pool the moment it expires.
 */
export const listProspects = onCall(
  { region: REGION },
  async (request) => {
    const partner = await requirePartner(request, 'listProspects');
    const visible = await poolFor(partner);
    const mine = visible.filter((p) => p.claimedByPartnerKey === partner.okey);
    const contacts = await contactsFor(mine.map((p) => p.okey));

    const rows: PoolRow[] = visible.map((p) => {
      const isMine = p.claimedByPartnerKey === partner.okey;
      const contact = isMine ? contacts.get(p.okey) : undefined;
      return {
        okey: p.okey,
        name: p.name,
        segment: p.segment,
        source: p.source,
        status: p.status,
        isMine,
        claimExpiresAt: isMine ? p.claimExpiresAt : '',
        ...(isMine ? {
          contactName: p.contactName,
          email: contact?.email ?? '',
          phone: contact?.phone ?? '',
        } : {}),
      };
    });
    return { prospects: rows };
  },
);

/**
 * C5 §1/§3 — claiming a lead IS the deal registration. First claim wins.
 *
 * In a transaction because that is the entire point: two partners racing on the same Verein is
 * the conflict this registry exists to settle, and a read-then-write would let both win.
 */
export const claimProspect = onCall(
  { region: REGION },
  async (request) => {
    const partner = await requirePartner(request, 'claimProspect');
    const okey = String((request.data ?? {}).prospectKey ?? '');
    if (!okey) throw new HttpsError('invalid-argument', 'prospectKey is required.');

    const ref = db().collection(ProspectCollection).doc(okey);
    const result = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'No such prospect.');
      const prospect = { ...(snap.data() as ProspectModel), okey: snap.id };
      const claim = applyClaim(prospect, partner.okey);
      if (!claim.ok) return claim;
      tx.update(ref, {
        status: claim.prospect.status,
        claimedByPartnerKey: claim.prospect.claimedByPartnerKey,
        claimedAt: claim.prospect.claimedAt,
        claimExpiresAt: claim.prospect.claimExpiresAt,
      });
      return claim;
    });

    if (!result.ok) {
      logger.info(`claimProspect: ${partner.okey} refused on ${okey} — ${result.reason}`);
      return { ok: false, reason: result.reason };
    }
    const contact = (await contactsFor([okey])).get(okey);
    logger.info(`claimProspect: ${partner.okey} claimed ${okey} until ${result.prospect.claimExpiresAt}`);
    return {
      ok: true,
      claimExpiresAt: result.prospect.claimExpiresAt,
      contactName: result.prospect.contactName,
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
    };
  },
);

/**
 * C5 §7 — early decline. The lead returns to the pool at once instead of sitting dead for the
 * remainder of the three months, and the record says `open` rather than `expired`: "gave it back"
 * and "sat on it" are different facts about a partner and the pool should not blur them.
 */
export const releaseProspect = onCall(
  { region: REGION },
  async (request) => {
    const partner = await requirePartner(request, 'releaseProspect');
    const okey = String((request.data ?? {}).prospectKey ?? '');
    if (!okey) throw new HttpsError('invalid-argument', 'prospectKey is required.');

    const prospect = await loadProspect(okey);
    if (prospect.claimedByPartnerKey !== partner.okey) {
      throw new HttpsError('permission-denied', 'This lead is not yours to release.');
    }
    const next = releaseClaim(prospect, true);
    await db().collection(ProspectCollection).doc(okey).update({
      status: next.status,
      claimedByPartnerKey: '',
      claimedAt: '',
      claimExpiresAt: '',
    });
    logger.info(`releaseProspect: ${partner.okey} declined ${okey}`);
    return { ok: true };
  },
);

/**
 * C5 §7 — a consent revocation beats an active claim, immediately. bkaiser-side (admin), because
 * the revocation reaches bkaiser, not the partner.
 *
 * The claim is terminated the moment this runs, whatever three-month window was left. What comes
 * back is `partnerToNotify`: the partner became an **independent controller** the moment they
 * received the lead (Vertragswerk Teil III.2), so their own copy is their own erasure duty, and
 * bkaiser cannot delete data inside a partner's installation and must not pretend otherwise. The
 * record itself is deleted by the erasure path (`subject-data-map.ts`), not here — that path
 * carries the prospect's address documents with it, which a delete here would orphan.
 *
 * ponytail: the notification is handed back to the admin to send. Automating it needs a contact
 * address for the partner, which lives on their Org in `bkg` and is not modelled as a
 * notification channel yet; wire it to `sendEmail` once it is.
 */
export const revokeProspect = onCall(
  { region: REGION },
  async (request) => {
    await requireAdmin(request, 'revokeProspect');
    const okey = String((request.data ?? {}).prospectKey ?? '');
    if (!okey) throw new HttpsError('invalid-argument', 'prospectKey is required.');

    const prospect = await loadProspect(okey);
    const { prospect: next, partnerToNotify } = revokeConsent(prospect);
    await db().collection(ProspectCollection).doc(okey).update({
      status: next.status,
      revokedAt: next.revokedAt,
      claimedByPartnerKey: '',
      claimedAt: '',
      claimExpiresAt: '',
    });

    let partnerName = '';
    if (partnerToNotify) {
      const snap = await db().collection(PartnerCollection).doc(partnerToNotify).get();
      partnerName = (snap.get('name') as string | undefined) ?? partnerToNotify;
      logger.warn(`revokeProspect: ${okey} revoked while claimed by ${partnerToNotify} — that partner must be told to stop contacting the person`);
    }
    return { ok: true, partnerToNotify, partnerName };
  },
);

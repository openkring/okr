// apps/functions/src/newsletter/unsubscribe.ts
//
// Signing off a newsletter (spec 1.169 §5.4):
// - `newsletterUnsubscribe`: the personal link of every issue, `?p=<personKey>&g=<groupKey>&h=<signature>`.
//   GET only shows a page with the button «Abmelden» (mail scanners prefetch links and must not sign anybody
//   off); POST — that button, or the mail client's RFC 8058 one-click POST `List-Unsubscribe=One-Click` to the
//   same URL — ends the subscription.
// - `leaveNewsletter`: the in-app leave action, for the subscriber, a member admin / privileged of the tenant,
//   or an admin of the newsletter.
// Both end the subscription with `endSubscription`, which then applies the only-link rule (tenant-link.ts).

import { CallableRequest, HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { GroupCollection, NewsletterSubscriptionCollection, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { invitationLinkSecret } from '../calendar/answer-link';
import { brandOf, NO_TENANT_LINKS, tenantLinks } from '../calendar/deliver';
import { answerResultPage, Brand, escapeHtml, layout, primaryStyle } from '../calendar/mail';
import { ANSWER_PAGE_CSP } from '../email/mailing-answer.logic';
import { pageFrame } from '../email/mailing-answer';
import { isElevated } from '../email/mailing-recipients';
import { toStoreDate } from '../srv/zurich-time';
import { verifyNewsletterUnsubscribe } from './newsletter-link';
import { releasePersonIfUnlinked } from './tenant-link';
import { isActiveSubscription } from './tenant-link.logic';

const REGION = 'europe-west6';
const TITLE = 'Newsletter';
const INVALID = 'Dieser Link ist ungültig.';
const DONE = 'Du bist abgemeldet.';

/**
 * Ends the person's active subscription(s) to the newsletter `groupKey` of `tenantId` (dateOfExit = today),
 * then applies the only-link rule. 'notActive' when there was nothing to end: then nothing is written, so a
 * repeated click is harmless. A failed only-link step is logged, not thrown: the exit itself stands, and the
 * person is only kept longer than needed — never released by mistake.
 */
export async function endSubscription(db: Firestore, tenantId: string, personKey: string, groupKey: string, today: string): Promise<'ended' | 'notActive'> {
  if (!tenantId || !personKey || !groupKey) return 'notActive';
  const ended = await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(NewsletterSubscriptionCollection)
      .where('tenants', 'array-contains', tenantId)
      .where('personKey', '==', personKey)
      .where('groupKey', '==', groupKey));
    const active = snap.docs.filter((d) => isActiveSubscription(d.data()));
    for (const d of active) tx.update(d.ref, { dateOfExit: today });
    return active.length > 0;
  });
  if (!ended) return 'notActive';
  try {
    await releasePersonIfUnlinked(db, tenantId, personKey, today);
  } catch (err) {
    logger.error(`newsletter: only-link rule failed in ${tenantId} after an exit`, err);
  }
  return 'ended';
}

/** The page behind the unsubscribe link: one question, one button; the form posts back to this very URL. */
export function unsubscribePage(brand: Brand, groupName: string): string {
  return layout(brand,
    `<h1 style="font-size:20px;margin:0 0 8px;">${escapeHtml(TITLE)}</h1>`
    + `<p>${escapeHtml(`Möchtest du den Newsletter ${groupName} abbestellen?`)}</p>`
    // no action: the form posts to the page's own URL, query (p, g, h) included; ANSWER_PAGE_CSP allows form-action 'self'
    + `<form method="post">`
    + `<button type="submit" style="${primaryStyle(brand)}border:0;cursor:pointer;font-size:16px;font-family:inherit;">Abmelden</button>`
    + `</form>`);
}

function param(req: { query: Record<string, unknown> }, name: string): string {
  const value = req.query[name];
  return typeof value === 'string' ? value : '';
}

export const newsletterUnsubscribe = onRequest(
  { region: REGION, secrets: [invitationLinkSecret], cors: false, maxInstances: 10 },
  async (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    // tenant-editable frame: no script, forms only back to this function
    res.set('Content-Security-Policy', ANSWER_PAGE_CSP);
    if (req.method !== 'GET' && req.method !== 'POST') { res.set('Allow', 'GET, POST'); res.status(405).send(''); return; }

    let brand: Brand = { appName: '' };
    const show = (message: string, status = 200): void => {
      res.status(status).send(answerResultPage({ ...brand, title: TITLE, message }));
    };
    try {
      // The keys always come from the query: the page's form and the one-click POST both post to the link
      // itself; the one-click body (`List-Unsubscribe=One-Click`) carries nothing we need.
      const personKey = param(req, 'p');
      const groupKey = param(req, 'g');
      const secret = invitationLinkSecret.value();
      // The signature first, before any read: fail closed without a secret.
      if (secret === '' || !personKey || !groupKey || !verifyNewsletterUnsubscribe(personKey, groupKey, param(req, 'h'), secret)) {
        show(INVALID, 403);
        return;
      }

      const db = getFirestore();
      const subs = (await db.collection(NewsletterSubscriptionCollection)
        .where('personKey', '==', personKey).where('groupKey', '==', groupKey).get()).docs.map((d) => d.data());
      const active = subs.filter((s) => isActiveSubscription(s));
      // a subscription has exactly one tenant; the tenants of the active ones are ended, the first one brands the page
      const activeTenants = [...new Set(active.map(tenantOf).filter((t) => t !== ''))];
      const tenantId = activeTenants[0] ?? subs.map(tenantOf).find((t) => t !== '') ?? '';
      const links = tenantId ? await tenantLinks(tenantId) : NO_TENANT_LINKS;
      brand = { ...brandOf(links), ...(tenantId ? { frame: await pageFrame(tenantId) } : {}) };

      if (activeTenants.length === 0) { show(DONE); return; }
      if (req.method === 'GET') {
        res.status(200).send(unsubscribePage(brand, await groupNameOf(db, groupKey, active[0])));
        return;
      }
      const today = toStoreDate(new Date());
      for (const t of activeTenants) await endSubscription(db, t, personKey, groupKey, today);
      logger.info(`newsletterUnsubscribe: one exit (tenant ${activeTenants.join(',')})`);
      show(DONE);
    } catch (err) {
      // never log the keys or the signature
      logger.error('newsletterUnsubscribe: failed', err);
      if (res.headersSent) return;
      res.status(500).send(answerResultPage({ ...brand, title: 'Das hat nicht geklappt', message: 'Versuch es bitte nochmals.' }));
    }
  },
);

function tenantOf(doc: DocumentData): string {
  return Array.isArray(doc['tenants']) && typeof doc['tenants'][0] === 'string' ? doc['tenants'][0] : '';
}

/** The newsletter's current name, else the name copied onto the subscription. */
async function groupNameOf(db: Firestore, groupKey: string, sub: DocumentData | undefined): Promise<string> {
  const group = (await db.collection(GroupCollection).doc(groupKey).get()).data();
  const name = typeof group?.['name'] === 'string' ? group['name'] : '';
  return name || String(sub?.['groupName'] ?? '');
}

interface LeaveRequest { tenantId?: unknown; subscriptionKey?: unknown }

export const leaveNewsletter = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<LeaveRequest>): Promise<{ ok: true }> => {
    const CF_NAME = 'leaveNewsletter';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const { tenantId, subscriptionKey } = request.data ?? {};
    if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('invalid-argument', 'tenantId is required.');
    if (typeof subscriptionKey !== 'string' || !subscriptionKey) throw new HttpsError('invalid-argument', 'subscriptionKey is required.');

    const db = getFirestore();
    // roles from the users doc: role claims are never minted
    const caller = (await db.collection(UserCollection).doc(request.auth?.uid ?? '').get()).data();
    const callerTenants = (caller?.['tenants'] ?? []) as string[];
    if (!caller || !callerTenants.includes(tenantId)) throw new HttpsError('permission-denied', 'Caller does not belong to this tenant.');

    const snap = await db.collection(NewsletterSubscriptionCollection).doc(subscriptionKey).get();
    const sub = snap.data();
    // a subscription of another tenant is answered exactly like a missing one
    if (!snap.exists || !sub || !((sub['tenants'] ?? []) as string[]).includes(tenantId)) {
      throw new HttpsError('not-found', 'No such subscription.');
    }
    const personKey = String(sub['personKey'] ?? '');
    const groupKey = String(sub['groupKey'] ?? '');
    const callerPersonKey = typeof caller['personKey'] === 'string' ? caller['personKey'] : '';

    const allowed = (callerPersonKey !== '' && callerPersonKey === personKey)
      || isElevated(caller['roles'])
      || (callerPersonKey !== '' && await isNewsletterAdmin(db, tenantId, groupKey, callerPersonKey));
    if (!allowed) throw new HttpsError('permission-denied', 'Only the subscriber, a member admin or an admin of the newsletter may end it.');

    await endSubscription(db, tenantId, personKey, groupKey, toStoreDate(new Date()));
    logger.info(`${CF_NAME}: done (tenant ${tenantId})`);
    return { ok: true };
  },
);

/** Whether the person is an admin of the newsletter group of this tenant (`admins[].key`, mirrored in `adminKeys`). */
async function isNewsletterAdmin(db: Firestore, tenantId: string, groupKey: string, personKey: string): Promise<boolean> {
  if (!groupKey) return false;
  const group = (await db.collection(GroupCollection).doc(groupKey).get()).data();
  if (!group || !((group['tenants'] ?? []) as string[]).includes(tenantId)) return false;
  const admins = (group['admins'] ?? []) as { key?: string }[];
  const adminKeys = (group['adminKeys'] ?? []) as string[];
  return admins.some((a) => a?.key === personKey) || adminKeys.includes(personKey);
}

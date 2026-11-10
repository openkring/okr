// apps/functions/src/billing/billing-mail.ts
//
// The three billing mails of the monthly run (plan 2 Task 6): charge failed, pastDue, closing. Same path as
// credit/topup-failed-mail.ts: a `sendEmail` row in workflow-outbox, delivered by onWorkflowOutbox with the
// tenant's provider. The row id is deterministic, so a retried run queues each mail once.
//
// Text: no Transloco in Cloud Functions. Keys are looked up like every server-side message (translateMessage: tenant
// override, then the default catalog); a key nobody entered yet falls back to the German text here.
import { logger } from 'firebase-functions/v2';
import type { Firestore } from 'firebase-admin/firestore';
import { SubscriptionCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { appOriginOf } from '../collection/payment-method';
import { createFirestoreDeps, translateMessage } from '../workflow/firestore-deps';
import { WorkflowOutboxCollection } from '../workflow/outbox';
import type { OutboxDoc } from '../workflow/outbox';

export const BILLING_MAIL_I18N_KEYS = {
  chargeFailedSubject: '@billing.chargeFailed.subject',
  chargeFailedBody: '@billing.chargeFailed.body',
  pastDueSubject: '@billing.pastDue.subject',
  pastDueBody: '@billing.pastDue.body',
  closingSubject: '@billing.closing.subject',
  closingBody: '@billing.closing.body',
} as const;

type MailKey = keyof typeof BILLING_MAIL_I18N_KEYS;

/** German defaults («du», friendly, no exclamation marks). Placeholders in single braces. */
export const BILLING_MAIL_DEFAULTS: Record<MailKey, string> = {
  chargeFailedSubject: 'Die Zahlung deiner Kring-Rechnung hat nicht geklappt',
  chargeFailedBody: 'Die Zahlung deiner Kring-Rechnung über CHF {amount} hat nicht geklappt. Du kannst sie hier bezahlen: {payLink}. '
    + 'Deine Zahlungsart änderst du unter {billingLink}.',
  pastDueSubject: 'Deine Kring-Rechnung ist noch offen',
  pastDueBody: 'Deine Kring-Rechnung ist noch offen. Bitte bezahle sie innert 30 Tagen, sonst schränken wir deinen Zugang ein: {payLink}',
  closingSubject: 'Dein Zugang ist jetzt eingeschränkt',
  closingBody: 'Deine Kring-Rechnung ist seit 30 Tagen offen. Dein Zugang ist jetzt eingeschränkt. '
    + 'Sobald die Rechnung bezahlt ist, ist alles wieder wie vorher: {payLink}',
};

/** The pay page of an invoice: payable there by any method. */
export const payLink = (appOrigin: string, invoiceKey: string): string => `${appOrigin}/pay/${encodeURIComponent(invoiceKey)}`;
export const billingLink = (appOrigin: string): string => `${appOrigin}/billing`;

/** Rappen to «1’234.50»: two decimals, Swiss apostrophe as thousands separator. */
export function formatChf(rappen: number): string {
  const [whole, dec] = (Math.abs(rappen) / 100).toFixed(2).split('.');
  return `${rappen < 0 ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '’')}.${dec}`;
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function text(tenantId: string, key: MailKey, params: Record<string, string>): Promise<string> {
  const messageKey = BILLING_MAIL_I18N_KEYS[key];
  const translated = await translateMessage(tenantId, messageKey, params);
  if (translated && translated !== messageKey) return translated;
  return BILLING_MAIL_DEFAULTS[key].replace(/\{(\w+)\}/g, (match: string, k: string) => params[k] ?? match);
}

/** billingEmail of the subscription, else the e-mail of the tenant's first admin. */
async function recipientOf(db: Firestore, tenantId: string): Promise<string> {
  const billingEmail = String((await db.collection(SubscriptionCollection).doc(tenantId).get()).data()?.['billingEmail'] ?? '');
  if (billingEmail) return billingEmail;
  const deps = createFirestoreDeps();
  const admin = await deps.tenantAdmin(tenantId);
  return admin ? deps.emailFor(admin.key, tenantId) : '';
}

/** The body is escaped plain text; every link in it becomes an anchor. */
function toHtml(body: string, links: string[]): string {
  let html = escapeHtml(body);
  for (const link of links) {
    const safe = escapeHtml(link);
    html = html.split(safe).join(`<a href="${safe}">${safe}</a>`);
  }
  return `<p>${html}</p>`;
}

async function queue(
  db: Firestore, tenantId: string, docId: string, ruleKey: string,
  subjectKey: MailKey, bodyKey: MailKey, params: (origin: string) => Record<string, string>,
): Promise<void> {
  const ref = db.collection(WorkflowOutboxCollection).doc(docId);
  if ((await ref.get()).exists) return;
  const to = await recipientOf(db, tenantId);
  if (!to) {
    logger.warn(`${ruleKey}: tenant ${tenantId} has no billing or admin e-mail`, { docId });
    return;
  }
  const p = params(await appOriginOf(db, tenantId));
  const subject = await text(tenantId, subjectKey, p);
  const body = await text(tenantId, bodyKey, p);
  const doc: OutboxDoc = {
    tenants: [tenantId], kind: 'sendEmail', ruleKey, day: getTodayStr(DateFormat.StoreDate), state: 'pending',
    payload: { to, subject, body: toHtml(body, Object.values(p).filter((v) => v.startsWith('http'))), template: '' },
  };
  await ref.create(doc).catch((err: { code?: number }) => {
    if (err?.code !== 6) throw err; // 6 = ALREADY_EXISTS: a parallel retry queued it
  });
}

/** A card charge of a monthly invoice failed (attempt = 1-based number of the try). */
export function notifyChargeFailed(
  db: Firestore, tenantId: string, input: { invoiceKey: string; amount: number; attempt: number },
): Promise<void> {
  return queue(db, tenantId, `billing-charge-failed-${input.invoiceKey}-${input.attempt}`, 'billing:charge-failed',
    'chargeFailedSubject', 'chargeFailedBody',
    (o) => ({ amount: formatChf(input.amount), payLink: payLink(o, input.invoiceKey), billingLink: billingLink(o) }));
}

/** Invoices are overdue: 30 days until the access is limited. One invoice links its pay page, several link /billing. */
export function notifyPastDue(
  db: Firestore, tenantId: string, input: { invoiceKeys: string[]; pastDueSince: string },
): Promise<void> {
  return queue(db, tenantId, `billing-pastdue-${tenantId}-${input.pastDueSince}`, 'billing:past-due',
    'pastDueSubject', 'pastDueBody',
    (o) => ({ payLink: input.invoiceKeys.length === 1 ? payLink(o, input.invoiceKeys[0]) : billingLink(o) }));
}

/** The access was limited (30 days open). Links /billing unless exactly one invoice key is given. */
export function notifyClosing(
  db: Firestore, tenantId: string, input: { closingSince: string; invoiceKeys?: string[] },
): Promise<void> {
  const keys = input.invoiceKeys ?? [];
  return queue(db, tenantId, `billing-closing-${tenantId}-${input.closingSince}`, 'billing:closing',
    'closingSubject', 'closingBody',
    (o) => ({ payLink: keys.length === 1 ? payLink(o, keys[0]) : billingLink(o) }));
}

// apps/functions/src/credit/topup-failed-mail.ts
//
// The mail to a tenant's admin when an auto top-up charge failed (plan 1.149 Task 9). Sent through the existing
// mail path: a `sendEmail` row in workflow-outbox, which onWorkflowOutbox delivers with the tenant's provider.
// The row id is derived from the payment attempt, so a retried webhook queues it once.
//
// Text: Cloud Functions have no Transloco. The keys below are looked up like every server-side message
// (translateMessage: tenant override, then the default catalog); a key nobody has entered yet falls back to the
// German text here, never to the bare key.
import { logger } from 'firebase-functions/v2';
import type { Firestore } from 'firebase-admin/firestore';
import { SubscriptionCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { appOriginOf } from '../collection/payment-method';
import { createFirestoreDeps, translateMessage } from '../workflow/firestore-deps';
import { WorkflowOutboxCollection } from '../workflow/outbox';
import type { OutboxDoc } from '../workflow/outbox';

export const TOPUP_FAILED_I18N_KEYS = {
  subject: '@credit.autoTopUpFailed.subject',
  body: '@credit.autoTopUpFailed.body',
  link: '@credit.autoTopUpFailed.link',
} as const;

/** German defaults («du», friendly, no exclamation marks). Placeholders in single braces. */
export const TOPUP_FAILED_DEFAULTS: Record<keyof typeof TOPUP_FAILED_I18N_KEYS, string> = {
  subject: 'Die automatische Aufladung deines Guthabens hat nicht geklappt',
  body: 'Die automatische Aufladung deines Guthabens über CHF {amount} konnte nicht belastet werden. '
    + 'Wir haben die automatische Aufladung deshalb ausgeschaltet, damit nichts weiter versucht wird. '
    + 'Die Rechnung für diese Aufladung ist noch offen: Über den Link unten kannst du sie mit einer anderen Zahlungsart begleichen, '
    + 'danach wird dein Guthaben aufgeladen. Prüfe bitte auch dein Zahlungsmittel und schalte die Aufladung danach wieder ein.',
  link: 'Rechnung ansehen und bezahlen',
};

/** The pay page of the declined top-up invoice: payable there by any method; once paid, onTopUpPaid credits it. */
export const topUpPayLink = (appOrigin: string, invoiceKey: string): string => `${appOrigin}/pay/${encodeURIComponent(invoiceKey)}`;

const chf = (rappen: number): string => (rappen / 100).toFixed(2);
const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function text(tenantId: string, key: keyof typeof TOPUP_FAILED_I18N_KEYS, params: Record<string, string>): Promise<string> {
  const messageKey = TOPUP_FAILED_I18N_KEYS[key];
  const translated = await translateMessage(tenantId, messageKey, params);
  if (translated && translated !== messageKey) return translated;
  return TOPUP_FAILED_DEFAULTS[key].replace(/\{(\w+)\}/g, (match: string, k: string) => params[k] ?? match);
}

/** billingEmail of the subscription, else the e-mail of the tenant's first admin. */
async function recipientOf(db: Firestore, tenantId: string): Promise<string> {
  const billingEmail = String((await db.collection(SubscriptionCollection).doc(tenantId).get()).data()?.['billingEmail'] ?? '');
  if (billingEmail) return billingEmail;
  const deps = createFirestoreDeps();
  const admin = await deps.tenantAdmin(tenantId);
  return admin ? deps.emailFor(admin.key, tenantId) : '';
}

export async function notifyAutoTopUpFailed(
  db: Firestore, tenantId: string, topUp: { attemptKey: string; invoiceKey: string; amount: number },
): Promise<void> {
  const ref = db.collection(WorkflowOutboxCollection).doc(`topup-failed-${topUp.attemptKey}`);
  if ((await ref.get()).exists) return;
  const to = await recipientOf(db, tenantId);
  if (!to) {
    logger.warn(`notifyAutoTopUpFailed: tenant ${tenantId} has no billing or admin e-mail`, { attemptKey: topUp.attemptKey });
    return;
  }
  const link = topUpPayLink(await appOriginOf(db, tenantId), topUp.invoiceKey);
  const params = { amount: chf(topUp.amount) };
  const subject = await text(tenantId, 'subject', params);
  const body = await text(tenantId, 'body', params);
  const linkLabel = await text(tenantId, 'link', params);
  const doc: OutboxDoc = {
    tenants: [tenantId], kind: 'sendEmail', ruleKey: 'credit:auto-topup-failed', day: getTodayStr(DateFormat.StoreDate), state: 'pending',
    payload: { to, subject, body: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(linkLabel)}</a></p>`, template: '' },
  };
  await ref.create(doc).catch((err: { code?: number }) => {
    if (err?.code !== 6) throw err; // 6 = ALREADY_EXISTS: a parallel retry queued it
  });
}

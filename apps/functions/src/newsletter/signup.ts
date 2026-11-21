// apps/functions/src/newsletter/signup.ts
//
// Newsletter sign-up through the form builder (spec 1.169 §5.2). `createNewsletterSignup` stores a PENDING
// `newsletterSignups` doc — no person yet; `onNewsletterSignupCreated` mails the signed confirmation link
// (double opt-in). Confirming (Task 6) turns the signup into a person + subscription. An unconfirmed
// signup is left as it is and expires (Task 8). The address is never written to a log.

import { createHash } from 'node:crypto';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret, projectID } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { HttpsError } from 'firebase-functions/v2/https';

import { GroupCollection, type Field } from '@okr/shared-models';
import { isSectionOnlyImplicit } from '@okr/shared-util-core';

import { getAppEmailConfig } from '../auth/email-templates';
import { sendEmailViaProvider } from '../auth/email-transport';
import { invitationLinkSecret } from '../calendar/answer-link';
import { renderEmail } from '../email/render-email';
import { escapeHtml, mailErrorCode } from '../forms/filler-confirmation';
import { checkRateLimit as checkBucketLimit } from '../publicApi/rateLimit';
import { toStoreDateTime } from '../srv/zurich-time';
import { newsletterConfirmUrl, newsletterFunctionUrl } from './newsletter-link';
import { normalizeEmail } from './subscriber.logic';
import { NewsletterSignupCollection, type NewsletterSignupDoc } from './types';

const REGION = 'europe-west6';
const mailtrapApiKey = defineSecret('MAILTRAP_APIKEY');

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the confirmation link lives. */
export const SIGNUP_VALID_DAYS = 7;
/** At most this many confirmation mails to one address per tenant per day. */
export const SIGNUP_MAIL_PER_ADDRESS = { limit: 3, windowMs: DAY_MS, failClosed: true as const };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export interface CreateNewsletterSignupInput {
  tenantId: string;
  formKey: string;
  /** the submitted values; `groupKey` is the section's implicit value */
  values: Record<string, unknown>;
  now: Date;
}

/** Stores the pending sign-up and returns its key (the signed confirm link carries it). */
export async function createNewsletterSignup(db: Firestore, input: CreateNewsletterSignupInput): Promise<string> {
  const { tenantId, formKey, values, now } = input;
  const email = normalizeEmail(text(values['email']));
  if (!EMAIL_SHAPE.test(email)) throw new HttpsError('invalid-argument', 'Invalid values for fields: email');
  const doc: NewsletterSignupDoc = {
    tenants: [tenantId],
    groupKey: text(values['groupKey']),
    formKey,
    firstName: text(values['firstName']),
    lastName: text(values['lastName']),
    email,
    city: text(values['city']),
    createdAt: toStoreDateTime(now),
    expiresAt: toStoreDateTime(new Date(now.getTime() + SIGNUP_VALID_DAYS * DAY_MS)),
    state: 'pending',
  };
  const ref = db.collection(NewsletterSignupCollection).doc();
  await ref.set(doc);
  return ref.id;
}

export interface NewsletterBranchInput extends CreateNewsletterSignupInput {
  isSpam: boolean;
  /** the form definition's fields */
  fields: Field[] | undefined;
}

/**
 * The `submitForm` branch of the `newsletterSignups` mapping. The group may only come from a verified page
 * section: the form must carry a section-only implicit `groupKey` field and the section must have resolved a
 * value for it, else the form is closed (nothing stored, the filler sees it). Spam stores nothing and gets a
 * random id.
 */
export async function submitNewsletterSignup(db: Firestore, input: NewsletterBranchInput): Promise<string> {
  const field = (Array.isArray(input.fields) ? input.fields : []).find((f) => f?.key === 'groupKey');
  if (!field || field.type !== 'implicit' || !isSectionOnlyImplicit(field) || text(input.values['groupKey']) === '') {
    logger.warn(`newsletter signup: form ${input.formKey} has no section-only groupKey — refused tenant=${input.tenantId}`);
    throw new HttpsError('failed-precondition', 'form-closed');
  }
  if (input.isSpam) return crypto.randomUUID();
  return createNewsletterSignup(db, input);
}

export type NewsletterGroupCheck = { ok: true; name: string; subTitle: string } | { ok: false };

/** A live newsletter group of this tenant: kind 'newsletter', not archived, `tenants` contains the tenant. */
export async function checkNewsletterGroup(db: Firestore, tenantId: string, groupKey: string): Promise<NewsletterGroupCheck> {
  if (groupKey === '') return { ok: false };
  const snap = await db.collection(GroupCollection).doc(groupKey).get();
  const g = snap.data();
  if (!snap.exists || !g) return { ok: false };
  const tenants = g['tenants'];
  if (g['kind'] !== 'newsletter' || g['isArchived'] === true || !Array.isArray(tenants) || !tenants.includes(tenantId)) return { ok: false };
  return { ok: true, name: text(g['name']), subTitle: text(g['subTitle']) };
}

/**
 * The canonical mailbox of an address: lowercase, no `+tag`, and for gmail.com / googlemail.com no dots in the
 * local part and googlemail.com mapped to gmail.com. Variants of one mailbox share one limit; never stored as
 * the address (the mail goes to the address as typed).
 */
export function mailboxKey(email: string): string {
  const lower = normalizeEmail(email);
  const at = lower.lastIndexOf('@');
  if (at <= 0) return lower;
  let local = lower.slice(0, at).split('+')[0];
  let domain = lower.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** The per-address limit key: the address is never in clear in the counter. */
function addressLimitKey(tenantId: string, email: string): string {
  return createHash('sha256').update(`${tenantId}|${mailboxKey(email)}`).digest('hex');
}

/** True when another live signup of this mailbox for this group already got a mail in the last 24 h. */
async function alreadyMailedRecently(db: Firestore, tenantId: string, signupKey: string, signup: NewsletterSignupDoc, now: Date): Promise<boolean> {
  const snap = await db.collection(NewsletterSignupCollection)
    .where('mailboxKey', '==', mailboxKey(signup.email))
    .where('groupKey', '==', signup.groupKey)
    .where('tenants', 'array-contains', tenantId)
    .get();
  const since = toStoreDateTime(new Date(now.getTime() - DAY_MS));
  const current = toStoreDateTime(now);
  return snap.docs.some((d) => {
    const o = d.data() as Partial<NewsletterSignupDoc>;
    return d.id !== signupKey && o.state === 'pending' && (o.mailedAt ?? '') >= since && (o.expiresAt ?? '') > current;
  });
}

function confirmationBody(name: string, subTitle: string, confirmUrl: string): string {
  const subject = subTitle !== '' ? ` (${escapeHtml(subTitle)})` : '';
  return [
    `<p>Du hast dich für den Newsletter <strong>${escapeHtml(name)}</strong>${subject} angemeldet. Damit wir dir den Newsletter schicken dürfen, bestätige bitte deine Anmeldung.</p>`,
    `<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#ffffff;text-decoration:none;border-radius:4px;">Anmeldung bestätigen</a></p>`,
    '<p>Wenn du dich nicht angemeldet hast, kannst du diese Mail ignorieren.</p>',
  ].join('\n');
}

export interface SignupMailContext {
  secret: string;
  projectId: string;
  /** for tests; defaults to the current time */
  now?: Date;
}

/**
 * Mails the confirmation link of a fresh sign-up. Sends nothing, and leaves the doc `pending`, when the
 * link secret is missing, the group is no live newsletter of the tenant, or the address hit its daily limit.
 * Logs tenant + reason only, never the address.
 */
export async function sendSignupConfirmation(db: Firestore, signupKey: string, signup: NewsletterSignupDoc, ctx: SignupMailContext): Promise<void> {
  const CF_NAME = 'onNewsletterSignupCreated';
  const tenantId = signup.tenants?.length === 1 ? signup.tenants[0] : '';
  if (tenantId === '') {
    logger.error(`${CF_NAME}: signup without exactly one tenant — no mail`);
    return;
  }
  if (ctx.secret === '') {
    logger.error(`${CF_NAME}: the link secret is not set — no mail tenant=${tenantId}`);
    return;
  }
  const group = await checkNewsletterGroup(db, tenantId, signup.groupKey);
  if (!group.ok) {
    logger.warn(`${CF_NAME}: no live newsletter group — no mail tenant=${tenantId}`);
    return;
  }
  if (await alreadyMailedRecently(db, tenantId, signupKey, signup, ctx.now ?? new Date())) {
    logger.warn(`${CF_NAME}: a confirmation for this mailbox and group was mailed in the last 24 h — no mail tenant=${tenantId}`);
    return;
  }
  const limit = await checkBucketLimit('newsletterSignupMail', addressLimitKey(tenantId, signup.email), SIGNUP_MAIL_PER_ADDRESS);
  if (!limit.allowed) {
    logger.warn(`${CF_NAME}: ${limit.unavailable ? 'limit unavailable' : 'address limit reached'} — no mail tenant=${tenantId}`);
    return;
  }
  try {
    const confirmUrl = newsletterConfirmUrl(newsletterFunctionUrl(ctx.projectId, 'newsletterConfirm'), signupKey, ctx.secret);
    const body = confirmationBody(group.name, group.subTitle, confirmUrl);
    const { html } = await renderEmail({ tenantId, layout: 'standard', body });
    const from = (await getAppEmailConfig(tenantId)).from;
    await sendEmailViaProvider('mailtrap_api', {
      from,
      to: [signup.email],
      subject: `Bitte bestätige deine Anmeldung zum Newsletter ${group.name}`,
      html,
    });
    await db.collection(NewsletterSignupCollection).doc(signupKey).update({
      mailboxKey: mailboxKey(signup.email),
      mailedAt: toStoreDateTime(ctx.now ?? new Date()),
    });
    logger.info(`${CF_NAME}: confirmation sent tenant=${tenantId}`);
  } catch (e) {
    // a short code only: the provider's response can echo the address
    logger.error(`${CF_NAME}: failed to send confirmation tenant=${tenantId} code=${mailErrorCode(e)}`);
  }
}

export const onNewsletterSignupCreated = onDocumentCreated(
  { document: `${NewsletterSignupCollection}/{signupKey}`, region: REGION, secrets: [invitationLinkSecret, mailtrapApiKey] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await sendSignupConfirmation(getFirestore(), snap.id, snap.data() as NewsletterSignupDoc, {
      secret: invitationLinkSecret.value(),
      projectId: projectID.value(),
    });
  },
);

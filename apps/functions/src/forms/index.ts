import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHmac, createHash } from 'node:crypto';

import { CourseCollection } from '@okr/shared-models';
import type { BaseType, ConfirmationVariant, DerivedValue, Field } from '@okr/shared-models';
import {
  buildConfirmationMessage,
  computeFormAvailability,
  DateFormat,
  getTodayStr,
  omitSsnValues,
  resolveImplicitValues,
} from '@okr/shared-util-core';
import { sendEmailViaProvider } from '../auth/email-transport';
import { getAppEmailConfig } from '../auth/email-templates';
import { createProspect } from '../business/prospect';
import { todayStoreDate } from '../calendar/recipients';
import { createBoathouseReservation } from './reservation-target';
import { emitEvent } from '../workflow/emit';
import { buildSubmissionTaskNotes, prepareSubmission, type SubmissionRow, type ValueNames } from './submission-pipeline';
import { projectPublicFormDefinition } from './public-definition';
import {
  acceptanceForSection,
  captchaRequired,
  isDocumentId,
  missingSectionOnlyValues,
  readVerifiedSection,
  type FormSectionProperties,
} from './form-section-config';
import { persistWithSlot, readResponseCount } from './form-stats';
import {
  buildFillerMail,
  escapeHtml,
  FILLER_MAIL_PER_FORM,
  FILLER_MAIL_PER_RECIPIENT,
  mailErrorCode,
  mailSafeAnswer,
  recipientLimitKey,
} from './filler-confirmation';
import { checkRateLimit as checkBucketLimit } from '../publicApi/rateLimit';
import { trustedClientIp } from './client-ip';

const REGION = 'europe-west6';
const formsHmacSecret = defineSecret('FORMS_HMAC_SECRET');
const mailtrapApiKey = defineSecret('MAILTRAP_APIKEY');

// ──────────────────────────────────────────
// Inlined types (avoids monorepo cross-bundle imports)
// ──────────────────────────────────────────

interface SubmissionTargetCollection {
  kind: 'collection';
  mappingKey: string;
  modelType: string;
  collectionName: string;
}

interface SubmissionTargetUrl {
  kind: 'url';
  url: string;
}

type SubmissionTarget = SubmissionTargetCollection | SubmissionTargetUrl;

interface FormMapping {
  mappingKey: string;
  label: string;
  modelType: string;
  collectionName: string;
  defaults?: Record<string, unknown>;
  /** Name of the typed-properties list on the target model (1.125). */
  propertiesField?: string;
}

interface AvatarInfoInline {
  key: string;
  name1: string;
  name2: string;
  modelType: string;
  type: string;
  subType: string;
  label: string;
}

interface ResponsibilityDoc {
  name: string;
  responsibleAvatar?: AvatarInfoInline;
}

interface FormDefinition {
  okey: string;
  formKey: string;
  name: string;
  honeypotKey: string;
  isArchived: boolean;
  tenants: string[];
  target: SubmissionTarget;
  /** Legacy documents may lack `fields`/`derivedValues` — coalesced where they are read. */
  fields?: Field[];
  derivedValues?: DerivedValue[];
  // 1.125 B — absent on legacy documents (reads skip model defaults); coalesced by the util-core helpers
  confirmationMessage?: string;
  confirmationVariants?: ConfirmationVariant[];
  sendFillerConfirmation?: boolean;
  isOpen?: boolean;
  closesAt?: string;
  maxResponses?: number;
  showRemaining?: boolean;
  closedMessage?: string;
}

interface SubmitFormPayload {
  formKey: string;
  sectionConfigRef: string;
  tenantId: string;
  values: Record<string, unknown>;
  meta: {
    pageLoadedAt: string;
    submittedAt: string;
    honeypotWebsite: string;
    jsToken: string;
    userAgentFingerprint: string;
    showCaptcha: boolean;
  };
}

// ──────────────────────────────────────────
// FormMapping whitelist (mirrors FORM_MAPPINGS in forms-util)
// ──────────────────────────────────────────

/** Exported for the mirror-drift test only — a one-sided edit fails a submit at runtime with
 *  'Unknown mapping', which no build or type-check catches. */
export const FORM_MAPPINGS: FormMapping[] = [
  {
    mappingKey: 'applications.default',
    label: 'Applications',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
    defaults: { state: 'applied', source: 'form', applicationFor: 'membership' },
    propertiesField: 'properties',
  },
  {
    mappingKey: 'applications.junior',
    label: 'Applications (Junioren)',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
    defaults: { state: 'applied', source: 'form', applicationAs: 'youth', applicationFor: 'membership' },
    propertiesField: 'properties',
  },
  {
    // 1.125 B / D-W4 — the course registration: an application FOR a course. `applicationFor: 'course'`
    // keeps `accept()` from creating a member; the course itself is the typed property `courseId`
    // (an implicit field, resolved server-side from the section). Mirrors
    // FORM_MAPPINGS in forms-util — edit BOTH copies.
    mappingKey: 'applications.course',
    label: 'Applications (Kurse)',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
    defaults: { state: 'applied', source: 'form', applicationFor: 'course' },
    propertiesField: 'properties',
  },
  {
    // C5 §2 — the kring.ch lead form. NOT written by the generic collection path below: a prospect
    // is two documents (the record + its contact details in the address vault), so this mapping is
    // dispatched to `createProspect`. See the doc comment there.
    mappingKey: 'prospects.default',
    label: 'Prospects (kring.ch)',
    modelType: 'ProspectModel',
    collectionName: 'prospects',
    defaults: { source: 'kring.ch' },
  },
  {
    // §6b / O1 — the boathouse reservation. NOT written by the generic collection path below:
    // a reservation carries typed avatars and a built index, so this mapping is dispatched to
    // `createBoathouseReservation`, which also enforces the two cross-field rules (end-before-
    // start, unticked confirmation) that per-field validators cannot express. Mirrors
    // FORM_MAPPINGS in forms-util — edit BOTH copies or a submit fails with 'Unknown mapping'.
    mappingKey: 'reservations.boathouse',
    label: 'Reservation Bootshaus',
    modelType: 'ReservationModel',
    collectionName: 'reservations',
    defaults: { state: 'initial' },
  },
];

function getFormMapping(mappingKey: string): FormMapping | undefined {
  return FORM_MAPPINGS.find(m => m.mappingKey === mappingKey);
}

// ──────────────────────────────────────────
// Token helpers
// ──────────────────────────────────────────

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function buildToken(formKey: string, secret: string): string {
  const timestamp = Date.now().toString();
  const payload = `${formKey}:${timestamp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyToken(token: string, secret: string): { valid: boolean; reason?: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  const parts = decoded.split(':');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [formKey, timestamp, sig] = parts;
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age > TOKEN_TTL_MS) return { valid: false, reason: 'expired' };
  const expected = createHmac('sha256', secret).update(`${formKey}:${timestamp}`).digest('hex');
  if (sig !== expected) return { valid: false, reason: 'invalid_sig' };
  return { valid: true };
}

// ──────────────────────────────────────────
// Rate-limit helpers (§10.4)
// ──────────────────────────────────────────

function fingerprintIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

function fingerprintUa(ua: string): string {
  return createHash('sha256').update(ua).digest('hex').substring(0, 16);
}

async function checkRateLimit(
  db: FirebaseFirestore.Firestore,
  ipHash: string,
  uaHash: string,
  limit: number,
  periodMinutes: number,
): Promise<{ exceeded: boolean; retryAfterSeconds: number }> {
  const windowSec = periodMinutes * 60;
  const windowStart = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${ipHash}_${uaHash}_${windowStart}`;
  const ref = db.collection('rateLimits').doc(key);

  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = (snap.data()?.['count'] as number ?? 0) + 1;
    const expiresAt = new Date((windowStart + 1) * windowSec * 1000);
    tx.set(ref, { count, expiresAt, ipHash, uaHash }, { merge: true });
    return count;
  });

  if (result > limit) {
    const windowEndMs = (windowStart + 1) * windowSec * 1000;
    return { exceeded: true, retryAfterSeconds: Math.ceil((windowEndMs - Date.now()) / 1000) };
  }
  return { exceeded: false, retryAfterSeconds: 0 };
}

// ──────────────────────────────────────────
// getFormToken — issues a short-lived HMAC token (§10.3)
// ──────────────────────────────────────────

export const getFormToken = onCall(
  { region: REGION, secrets: [formsHmacSecret] },
  async (request: CallableRequest<{ formKey: string }>) => {
    const formKey = request.data?.formKey;
    if (!formKey) throw new HttpsError('invalid-argument', 'formKey required');
    const secret = formsHmacSecret.value();
    if (!secret) {
      logger.error('getFormToken: FORMS_HMAC_SECRET not configured');
      throw new HttpsError('internal', 'Server configuration error');
    }
    return { token: buildToken(formKey, secret) };
  }
);

// ──────────────────────────────────────────
// Public form definition — anonymous gateway so forms render on public pages
// without exposing the formDefinitions collection to client reads. Returns only
// the fields the renderer/submit need; never the encryption key hash or audit data.
// ──────────────────────────────────────────
export const getFormDefinition = onCall(
  { region: REGION },
  async (request: CallableRequest<{ formKey: string; tenantId: string; sectionId?: string }>) => {
    const formKey = request.data?.formKey;
    const tenantId = request.data?.tenantId;
    if (!formKey || !tenantId) {
      throw new HttpsError('invalid-argument', 'formKey and tenantId are required');
    }
    const db = getFirestore();
    const snap = await db.collection('formDefinitions')
      .where('formKey', '==', formKey)
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .limit(1)
      .get();
    if (snap.empty) {
      throw new HttpsError('not-found', `Form '${formKey}' not found`);
    }
    const doc = snap.docs[0];
    // the document id last: a stored `okey` field must never redirect the formStats id
    const formDef = { ...doc.data(), okey: doc.id } as FormDefinition;
    // 1.125 B — open / closed / places left for THIS page: the section's overrides count only when it
    // really is a form section of this form in this tenant (an old app sends no sectionId: form-wide rules).
    const section = await readVerifiedSection(db, request.data?.sectionId, formKey, tenantId);
    const { availability } = await availabilityOf(db, formDef, section);
    // Public-safe projection — whitelist only (see public-definition.ts).
    return { ...projectPublicFormDefinition(doc.id, doc.data(), formKey, tenantId), availability };
  }
);

// ──────────────────────────────────────────
// Acceptance (1.125 B, spec §11)
// ──────────────────────────────────────────

/** Open/closed and places left for the form on one (verified) section, for today in Europe/Zurich. */
async function availabilityOf(
  db: FirebaseFirestore.Firestore,
  formDef: FormDefinition,
  section: { id: string; props: FormSectionProperties } | undefined,
) {
  // a form whose implicit value can only come from a page is closed without a verified section
  const settings = acceptanceForSection(formDef, section);
  // the counter is read only when there is a limit to compare it with
  const count = settings.maxResponses > 0 ? await readResponseCount(db, settings.statsId) : 0;
  return { settings, availability: computeFormAvailability(settings, count, todayStoreDate()) };
}

// ──────────────────────────────────────────
// Phase 5 helpers
// ──────────────────────────────────────────

function buildSubmissionEmailHtml(
  formDef: FormDefinition,
  rows: SubmissionRow[],
  submissionId: string,
  submittedAt: string,
): string {
  const rowsHtml = rows
    .map(r => `<tr>
        <th style="text-align:left;padding:4px 12px 4px 0;font-weight:600;">${escapeHtml(r.label)}</th>
        <td style="padding:4px 0;">${escapeHtml(r.value)}</td>
      </tr>`)
    .join('');

  return `
    <h2 style="margin:0 0 16px;">${escapeHtml(formDef.name ?? '')} – neue Einreichung</h2>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rowsHtml}
    </table>
    <p style="color:#888;font-size:12px;margin-top:20px;">
      Eingereicht: ${submittedAt} &middot; ID: ${submissionId}
    </p>
  `.trim();
}

async function runSideEffects(
  db: FirebaseFirestore.Firestore,
  sectionProps: FormSectionProperties,
  tenantId: string,
  formDef: FormDefinition,
  values: Record<string, unknown>,
  rows: SubmissionRow[],
  submissionId: string,
  submittedAt: string,
  cfName: string,
): Promise<void> {
  // The section was read and verified once by submitForm (a section of THIS form in THIS tenant):
  // a forged reference opens no task and mails no board.
  const { responsibilityKey, emailAddresses } = sectionProps;

  // ── Task creation ────────────────────────
  if (responsibilityKey) {
    try {
      const respSnap = await db.collection('responsibilities').doc(responsibilityKey).get();
      const resp = respSnap.data() as ResponsibilityDoc | undefined;
      const assignee = resp?.responsibleAvatar;

      if (assignee) {
        await db.collection('tasks').add({
          name: `${formDef.name} – Formulareinreichung`,
          tenants: [tenantId],
          isArchived: false,
          state: 'open',
          completionDate: '',
          dueDate: '',
          priority: 1,
          importance: 1,
          assignee,
          // without the AHV numbers: they stay in the target record (privacy 1.19)
          notes: buildSubmissionTaskNotes(formDef.fields, submissionId, formDef.formKey, values),
          tags: ['form.submission'],
          index: `c:form a:submission s:${submissionId}`,
          createdAt: FieldValue.serverTimestamp(),
        });
        logger.info(`${cfName}: approval task created responsibilityKey=${responsibilityKey}`);
      } else {
        logger.warn(`${cfName}: responsibility ${responsibilityKey} has no responsibleAvatar — skipping task`);
      }
    } catch (e) {
      logger.error(`${cfName}: failed to create approval task`, e);
    }
  }

  // ── Email notification ───────────────────
  if (Array.isArray(emailAddresses) && emailAddresses.length > 0) {
    try {
      // Use the app's verified sender address (mailtrap_api only accepts authorized domains).
      const from = (await getAppEmailConfig(tenantId)).from;
      const subject = `${formDef.name} – neue Einreichung`;
      const html = buildSubmissionEmailHtml(formDef, rows, submissionId, submittedAt);

      await sendEmailViaProvider('mailtrap_api', { from, to: emailAddresses, subject, html });
      logger.info(`${cfName}: notification email sent to ${emailAddresses.join(', ')}`);
    } catch (e) {
      logger.error(`${cfName}: failed to send notification email`, e);
    }
  }
}

/**
 * The course name for the board e-mail row of an implicit `courseId` (1.125 B): `courses/{value}`
 * when it exists in this tenant, else nothing (the row shows the raw value). Display only — never stored.
 */
async function readCourseNames(
  db: FirebaseFirestore.Firestore,
  fields: Field[],
  implicit: Record<string, BaseType>,
  tenantId: string,
  cfName: string,
): Promise<ValueNames> {
  const courseId = implicit['courseId'];
  const hasField = fields.some((f) => f?.type === 'implicit' && f.key === 'courseId');
  if (!hasField || !isDocumentId(courseId)) return {};
  try {
    const snap = await db.collection(CourseCollection).doc(courseId).get();
    const data = snap.data();
    const tenants = data?.['tenants'];
    const name = data?.['name'];
    if (snap.exists && Array.isArray(tenants) && tenants.includes(tenantId) && typeof name === 'string' && name.trim() !== '') {
      return { courseId: { [courseId]: name } };
    }
  } catch (e) {
    logger.warn(`${cfName}: could not read course ${courseId}`, e);
  }
  return {};
}

/**
 * Mails the thank-you text to the first visible e-mail answer. Best effort: an error is logged
 * (without the address or any answer) and never fails the submit. Nothing is stored.
 */
async function sendFillerConfirmation(
  formDef: FormDefinition,
  confirmation: string,
  answers: Record<string, unknown>,
  visible: Set<string>,
  tenantId: string,
  submissionId: string,
  cfName: string,
): Promise<void> {
  const mail = buildFillerMail(formDef.name ?? '', confirmation, formDef.fields ?? [], answers, visible);
  if (mail === undefined) {
    logger.info(`${cfName}: no filler confirmation (no visible e-mail answer) submissionId=${submissionId}`);
    return;
  }
  // Anyone can type a stranger's address: bound how often the club's sender writes to one address,
  // and how many thank-you mails one form sends a day. The address is normalized (+tag, dots) and hashed in the key.
  const toAddress = await checkBucketLimit('formMailTo', `${tenantId}:${recipientLimitKey(mail.to)}`, FILLER_MAIL_PER_RECIPIENT);
  if (!toAddress.allowed) {
    logger.warn(`${cfName}: filler confirmation skipped (${toAddress.unavailable ? 'limit unavailable' : 'recipient limit'}) submissionId=${submissionId}`);
    return;
  }
  const perForm = await checkBucketLimit('formMailForm', `${tenantId}:${formDef.okey}`, FILLER_MAIL_PER_FORM);
  if (!perForm.allowed) {
    logger.warn(`${cfName}: filler confirmation skipped (${perForm.unavailable ? 'limit unavailable' : 'daily form limit'}) submissionId=${submissionId}`);
    return;
  }
  try {
    // the app's verified sender (mailtrap_api only accepts authorized domains)
    const from = (await getAppEmailConfig(tenantId)).from;
    await sendEmailViaProvider('mailtrap_api', { from, to: [mail.to], subject: mail.subject, html: mail.html });
    logger.info(`${cfName}: filler confirmation sent submissionId=${submissionId}`);
  } catch (e) {
    // a status / short code only: the provider's response body can echo the address or the text
    logger.error(`${cfName}: failed to send filler confirmation submissionId=${submissionId} code=${mailErrorCode(e)}`);
  }
}

// ──────────────────────────────────────────
// submitForm
// ──────────────────────────────────────────

export const submitForm = onCall(
  { region: REGION, secrets: [formsHmacSecret, mailtrapApiKey] },
  async (request: CallableRequest<SubmitFormPayload>) => {
    const CF_NAME = 'submitForm';
    const payload = request.data;

    if (!payload?.formKey || !payload.tenantId) {
      throw new HttpsError('invalid-argument', 'formKey and tenantId are required');
    }

    const db = getFirestore();
    const startMs = Date.now();

    // ── 1. Resolve form definition ───────────────
    const formSnap = await db.collection('formDefinitions')
      .where('formKey', '==', payload.formKey)
      .where('tenants', 'array-contains', payload.tenantId)
      .where('isArchived', '==', false)
      .limit(1)
      .get();

    if (formSnap.empty) {
      throw new HttpsError('not-found', `Form '${payload.formKey}' not found`);
    }

    // the document id last: a stored `okey` field must never redirect the formStats id
    const formDef = { ...formSnap.docs[0].data(), okey: formSnap.docs[0].id } as FormDefinition;

    const sectionConfig = formSnap.docs[0].data()?.['rateLimit'] as
      { limit?: number; periodMinutes?: number } | undefined;
    const rateLimit = sectionConfig?.limit ?? 10;
    const ratePeriod = sectionConfig?.periodMinutes ?? 5;

    // ── 2. Rate limit (§10.4) — respond 429, do NOT store ──
    // the rightmost public X-Forwarded-For hop: the leftmost is the caller's own choice
    const rawIp = trustedClientIp(request.rawRequest.headers['x-forwarded-for'], request.rawRequest.socket?.remoteAddress);
    const rawUa = (request.rawRequest.headers['user-agent'] as string | undefined) ?? '';
    const ipHash = fingerprintIp(rawIp);
    const uaHash = fingerprintUa(rawUa);

    const rateResult = await checkRateLimit(db, ipHash, uaHash, rateLimit, ratePeriod);
    if (rateResult.exceeded) {
      logger.warn(`${CF_NAME}: rate limit exceeded formKey=${payload.formKey} ip=${ipHash}`);
      await db.collection('activities').add({
        tenants: [payload.tenantId],
        isArchived: false,
        timestamp: getTodayStr(DateFormat.StoreDateTime),
        scope: 'form',
        action: 'submission.rate_limited',
        roleNeeded: 'admin',
        payload: JSON.stringify({ formKey: payload.formKey, ipHash }),
        index: `t:${getTodayStr(DateFormat.StoreDateTime)} c:form a:rate_limited`,
        createdAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError('resource-exhausted', 'Too many requests', {
        retryAfterSeconds: rateResult.retryAfterSeconds,
      });
    }

    // ── 3. Spam checks ────────────────────────────
    // The section a submission names is a client claim: only a form section of THIS form in THIS
    // tenant counts (step 3b). Read here because its captcha setting decides §10.5.
    const section = await readVerifiedSection(db, payload.sectionConfigRef, payload.formKey, payload.tenantId);
    if (payload.sectionConfigRef && section === undefined) {
      const ref = isDocumentId(payload.sectionConfigRef) ? payload.sectionConfigRef : 'invalid';
      logger.warn(`${CF_NAME}: section ${ref} is no form section of formKey=${payload.formKey} in this tenant — ignored`);
    }
    const spamReasons: string[] = [];

    // §10.1 Honeypot field
    const honeypotKey = formDef.honeypotKey || 'website';
    const honeypotValue = String(payload.meta.honeypotWebsite ?? '');
    if (honeypotValue.trim() !== '') {
      spamReasons.push('honeypot');
      logger.info(`${CF_NAME}: honeypot triggered formKey=${payload.formKey}`);
    }

    // §10.2 Time-based — flag if submitted in < 1500ms
    const pageLoadedAt = Date.parse(payload.meta.pageLoadedAt);
    const submittedAt = Date.parse(payload.meta.submittedAt);
    if (!isNaN(pageLoadedAt) && !isNaN(submittedAt)) {
      const deltaMs = submittedAt - pageLoadedAt;
      if (deltaMs < 1500) {
        spamReasons.push('too_fast');
        logger.info(`${CF_NAME}: too_fast delta=${deltaMs}ms formKey=${payload.formKey}`);
      }
    }

    // §10.5 Optional CAPTCHA — verify App Check token score. Required when the verified section asks
    // for it, not only when the client says so: a bot sending `showCaptcha: false` must not skip it.
    if (captchaRequired(section, payload.meta.showCaptcha)) {
      if (!request.app) {
        spamReasons.push('captcha_missing');
        logger.info(`${CF_NAME}: captcha_missing (no App Check token) formKey=${payload.formKey}`);
      }
      // request.app.token.score available with reCAPTCHA Enterprise — threshold 0.5
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const score = (request.app as any)?.token?.score;
      if (score !== undefined && score < 0.5) {
        spamReasons.push('captcha_low_score');
        logger.info(`${CF_NAME}: captcha_low_score score=${score} formKey=${payload.formKey}`);
      }
    }

    // §10.3 JS token
    const secret = formsHmacSecret.value();
    if (secret && payload.meta.jsToken) {
      const tokenResult = verifyToken(payload.meta.jsToken, secret);
      if (!tokenResult.valid) {
        spamReasons.push('invalid_token');
        logger.info(`${CF_NAME}: invalid_token reason=${tokenResult.reason} formKey=${payload.formKey}`);
      }
    } else if (secret && !payload.meta.jsToken) {
      // Token missing entirely — bot did not execute JS
      spamReasons.push('missing_token');
    }

    const isSpam = spamReasons.length > 0;

    // ── 3b. Section, open / closed (1.125 B, spec §8.1, §11) ──
    // `sectionConfigRef` is the client's claim: its implicit values, overrides, task and board mail
    // count only for a form section of THIS form in THIS tenant (review focus 1). A closed or full
    // form refuses spam too — a bot gets the same answer as a person.
    // (the section itself is read before the spam checks, which take its captcha setting)
    const today = todayStoreDate();
    const fields = formDef.fields ?? [];
    const { settings: acceptance, availability } = await availabilityOf(db, formDef, section);
    if (!availability.isOpen) {
      logger.info(`${CF_NAME}: refused formKey=${payload.formKey} reason=${availability.reason} isSpam=${isSpam}`);
      throw new HttpsError('failed-precondition', availability.reason === 'full' ? 'form-full' : 'form-closed');
    }

    // ── 4. Server-side validation + clean values (1.125, spec §7.2) ──
    // The definition — not the client — decides what is stored: hidden fields are absent (not
    // required, not stored), keys that are no input field (honeypot, `_jsToken`, anything
    // invented) are dropped, derived values overwrite the client's, and `asProperty` answers
    // become the typed `properties` list when the mapping has one. Implicit values come from the
    // verified section, then an allowed link value, then the field default — never the client otherwise.
    const target = formDef.target;
    const mapping = target.kind === 'collection' ? getFormMapping(target.mappingKey) : undefined;
    if (target.kind === 'collection' && !mapping) {
      throw new HttpsError('failed-precondition', `Unknown mapping: ${target.mappingKey}`);
    }
    const implicit = resolveImplicitValues(fields, section?.props.implicitValues, payload.values ?? {});
    // A section saved before the implicit field existed passes the check above but carries no value for it:
    // the registration would be stored without its course. Refused like a closed form — before a place is taken.
    const missingImplicit = missingSectionOnlyValues(fields, implicit);
    if (missingImplicit.length > 0) {
      logger.warn(
        `${CF_NAME}: section ${section?.id ?? 'none'} of formKey=${payload.formKey} (form ${formDef.okey}) has no value for `
        + `${missingImplicit.join(', ')} — refused`,
      );
      throw new HttpsError('failed-precondition', 'form-closed');
    }
    // the board e-mail shows the course by name; only read for a submission that can mail anybody
    const names = isSpam ? {} : await readCourseNames(db, fields, implicit, payload.tenantId, CF_NAME);
    const prepared = prepareSubmission(
      fields,
      formDef.derivedValues,
      mapping?.propertiesField,
      payload.values ?? {},
      today,
      implicit,
      names,
    );

    if (prepared.missingRequired.length > 0) {
      throw new HttpsError(
        'invalid-argument',
        `Missing required fields: ${prepared.missingRequired.join(', ')}`
      );
    }
    if (prepared.invalidProperties.length > 0) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid values for fields: ${prepared.invalidProperties.join(', ')}`
      );
    }
    if (prepared.invalidSsn.length > 0) {
      // names the key only — never the number
      throw new HttpsError(
        'invalid-argument',
        `Invalid AHV numbers for fields: ${prepared.invalidSsn.join(', ')}`
      );
    }

    if (prepared.droppedDerivedProperties.length > 0) {
      // Admin-authored derived values: a misconfigured type is a definition bug, not the filler's fault.
      logger.warn(`${CF_NAME}: derived properties dropped (value does not coerce) formKey=${payload.formKey} keys=${prepared.droppedDerivedProperties.join(', ')}`);
    }

    // ── 5. Persist ────────────────────────────────
    let collectionName: string | undefined;
    let targetUrl: string | undefined;

    const cleanValues = prepared.values;
    // An AHV number (`ssn` field) is stored in the target record and nowhere else (privacy 1.19):
    // everything below that is not the generic collection write gets the answers without it.
    const shareableValues = omitSsnValues(formDef.fields, cleanValues);

    if (target.kind === 'collection') collectionName = target.collectionName;
    else targetUrl = target.url;

    const write = async (): Promise<string> => {
      if (target.kind === 'collection') {
        // checked in step 4 — repeated for the type narrowing only
        if (!mapping) throw new HttpsError('failed-precondition', `Unknown mapping: ${target.mappingKey}`);

        if (mapping.collectionName === 'reservations') {
          // Like prospects: not the generic write. Creating the reservation SERVER-side is the
          // point of the conversion — the old modal's `isReservation()` was a client-side check
          // a client could bypass, and `reservations` is client-writable in the rules. A
          // spam-flagged submission is not stored: unlike an application, which an admin reviews
          // in the back office, a reservation would land straight in the resource calendar.
          if (isSpam) return crypto.randomUUID();
          return createBoathouseReservation(db, {
            tenantId: payload.tenantId,
            uid: request.auth?.uid,
            values: shareableValues,
            defaults: mapping.defaults,
          });
        }
        if (mapping.collectionName === 'prospects') {
          // C5 §5 — the one target that is not a single document. The record and its contact
          // details (an `addresses` doc under `parentKey = 'prospect.<okey>'`) are written together
          // by `createProspect`, which also refuses a submission without consent — a checkbox that
          // arrives as `false` passes the required-field check above, so that refusal has to live
          // with the write. A spam-flagged lead is NOT stored: unlike an application, which an admin
          // reviews in the back office, a prospect would go straight into the partner pool.
          if (isSpam) return crypto.randomUUID();
          return createProspect({ ...shareableValues, ...(mapping.defaults ?? {}) });
        }
        const record: Record<string, unknown> = {
          ...cleanValues,
          ...(mapping.defaults ?? {}),   // defaults always win
          tenants: [payload.tenantId],
          submittedAt: payload.meta.submittedAt,
          isSpam,
          spamReasons: spamReasons.length > 0 ? spamReasons : undefined,
          formKey: payload.formKey,
        };
        const docRef = await db.collection(target.collectionName).add(record);
        return docRef.id;
      }

      if (!isSpam) {
        const body = new URLSearchParams();
        // an external URL is a third party: it never receives an AHV number
        for (const [k, v] of Object.entries(shareableValues)) body.set(k, String(v ?? ''));
        const response = await fetch(target.url, {
          method: 'POST',
          body: body.toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (!response.ok) {
          logger.error(`${CF_NAME}: URL target ${target.url} returned ${response.status}`);
          throw new HttpsError('internal', `Submission to external URL failed (HTTP ${response.status})`);
        }
      }
      return crypto.randomUUID();
    };

    // 1.125 B — a non-spam submission takes a place (transaction on formStats) before the write and
    // gives it back when the write fails; a full form is refused here even if step 3b still saw a place.
    const submissionId = await persistWithSlot(db, acceptance, payload.tenantId, isSpam, write);

    // The thank-you text (spec §10): returned for spam too (no tell). Built by buildConfirmationMessage,
    // which never puts an AHV number into a placeholder (R1). '' = the client shows its default text.
    const confirmation = buildConfirmationMessage(
      fields, formDef.confirmationMessage, formDef.confirmationVariants, prepared.answers, prepared.visible, today,
    );

    // ── 6. Audit log ──────────────────────────────
    const durationMs = Date.now() - startMs;
    await db.collection('activities').add({
      tenants: [payload.tenantId],
      isArchived: false,
      timestamp: getTodayStr(DateFormat.StoreDateTime),
      scope: 'form',
      action: 'submission',
      roleNeeded: 'admin',
      payload: JSON.stringify({
        formKey: payload.formKey,
        submissionId,
        collectionName,
        targetUrl,
        isSpam,
        spamReasons,
        durationMs,
        ipHash,
        userAgentFingerprint: payload.meta.userAgentFingerprint,
      }),
      index: `t:${getTodayStr(DateFormat.StoreDateTime)} c:form a:submission`,
      createdAt: FieldValue.serverTimestamp(),
    });

    // ── 7. Side effects (tasks, email) ────────────
    if (!isSpam && section !== undefined) {
      await runSideEffects(
        db, section.props, payload.tenantId,
        formDef, shareableValues, prepared.rows, submissionId, payload.meta.submittedAt,
        CF_NAME,
      );
    }

    // ── 7b. Thank-you mail to the filler (spec §10) — never for spam, never fails the submit ──
    // The mail repeats answers only through mailSafeAnswer (no links, one line, short): it goes out from
    // the club's address to whatever address was typed in. The screen keeps `confirmation` as is.
    if (!isSpam && formDef.sendFillerConfirmation === true) {
      const mailConfirmation = buildConfirmationMessage(
        fields, formDef.confirmationMessage, formDef.confirmationVariants, prepared.answers, prepared.visible, today, mailSafeAnswer,
      );
      await sendFillerConfirmation(formDef, mailConfirmation, prepared.answers, prepared.visible, payload.tenantId, submissionId, CF_NAME);
    }

    // ── 8. Workflow event ─────────────────────────
    // A spam-flagged submission emits nothing: a rule must never be a way for an anonymous
    // form to open tasks or mail the board. A submission has no personKey either (the
    // submitter is not a person yet), so the person-scoped probes correctly find nothing.
    if (!isSpam) {
      await emitEvent('form.submitted', payload.tenantId, `formSubmission.${submissionId}`, {
        subjectName: String(shareableValues['lastName'] ?? shareableValues['name'] ?? shareableValues['email'] ?? ''),
        params: { formKey: payload.formKey, formName: formDef.name ?? '', collectionName: collectionName ?? '' },
      });
    }

    logger.info(`${CF_NAME}: done submissionId=${submissionId} isSpam=${isSpam} durationMs=${durationMs}`);

    // old apps read only `submissionId`
    return { submissionId, confirmation };
  }
);

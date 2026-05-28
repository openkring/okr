import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHmac, createHash } from 'node:crypto';

import { getTodayStr, DateFormat } from '@bk2/shared-util-core';

const REGION = 'europe-west6';
const formsHmacSecret = defineSecret('FORMS_HMAC_SECRET');

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
}

interface FieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
}

interface FormDefinition {
  bkey: string;
  formKey: string;
  name: string;
  honeypotKey: string;
  isArchived: boolean;
  tenants: string[];
  target: SubmissionTarget;
  fields: FieldDef[];
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
  };
}

// ──────────────────────────────────────────
// FormMapping whitelist (mirrors FORM_MAPPINGS in forms-util)
// ──────────────────────────────────────────

const FORM_MAPPINGS: FormMapping[] = [
  {
    mappingKey: 'applications.default',
    label: 'Applications',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
    defaults: { state: 'applied', source: 'form' },
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
// submitForm — Phase 3 (with spam checks)
// ──────────────────────────────────────────

export const submitForm = onCall(
  { region: REGION, secrets: [formsHmacSecret] },
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

    const formDef = { bkey: formSnap.docs[0].id, ...formSnap.docs[0].data() } as FormDefinition;

    const sectionConfig = formSnap.docs[0].data()?.['rateLimit'] as
      { limit?: number; periodMinutes?: number } | undefined;
    const rateLimit = sectionConfig?.limit ?? 10;
    const ratePeriod = sectionConfig?.periodMinutes ?? 5;

    // ── 2. Rate limit (§10.4) — respond 429, do NOT store ──
    const rawIp =
      (request.rawRequest.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
      ?? request.rawRequest.socket?.remoteAddress
      ?? 'unknown';
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

    // ── 4. Server-side validation ─────────────────
    const missingRequired = formDef.fields
      .filter(f => f.required)
      .filter(f => {
        const val = payload.values[f.key];
        return val === undefined || val === null || val === '';
      });

    if (missingRequired.length > 0) {
      throw new HttpsError(
        'invalid-argument',
        `Missing required fields: ${missingRequired.map(f => f.key).join(', ')}`
      );
    }

    // ── 5. Persist ────────────────────────────────
    const target = formDef.target;
    let submissionId: string;
    let collectionName: string | undefined;
    let targetUrl: string | undefined;

    // Strip honeypot key from submitted values before persisting
    const cleanValues = { ...payload.values };
    delete cleanValues[honeypotKey];
    delete cleanValues['_jsToken'];

    if (target.kind === 'collection') {
      const mapping = getFormMapping(target.mappingKey);
      if (!mapping) {
        throw new HttpsError('failed-precondition', `Unknown mapping: ${target.mappingKey}`);
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
      submissionId = docRef.id;
      collectionName = target.collectionName;

    } else {
      if (!isSpam) {
        const body = new URLSearchParams();
        for (const [k, v] of Object.entries(cleanValues)) body.set(k, String(v ?? ''));
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
      submissionId = crypto.randomUUID();
      targetUrl = target.url;
    }

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

    // ── 7. Side effects (tasks, email) — Phase 5 ──
    if (!isSpam) {
      // placeholder
    }

    logger.info(`${CF_NAME}: done submissionId=${submissionId} isSpam=${isSpam} durationMs=${durationMs}`);

    return { submissionId };
  }
);

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { getTodayStr, DateFormat } from '@bk2/shared-util-core';

const REGION = 'europe-west6';

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
// Whitelist — mirrors FORM_MAPPINGS in forms-util
// (must be kept in sync manually)
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
// submitForm — Phase 2 (no spam checks yet)
// ──────────────────────────────────────────

export const submitForm = onCall(
  { region: REGION },
  async (request: CallableRequest<SubmitFormPayload>) => {
    const CF_NAME = 'submitForm';
    const payload = request.data;

    if (!payload?.formKey || !payload.tenantId) {
      throw new HttpsError('invalid-argument', 'formKey and tenantId are required');
    }

    const db = getFirestore();
    const startMs = Date.now();

    // ── 1. Resolve form definition ──────────────
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

    // ── 2. Rate limit — Phase 3 ─────────────────
    // (skipped)

    // ── 3. Spam checks — Phase 3 ────────────────
    const isSpam = false;

    // ── 4. Server-side validation ────────────────
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

    // ── 5. Persist ───────────────────────────────
    const target = formDef.target;
    let submissionId: string;
    let collectionName: string | undefined;
    let targetUrl: string | undefined;

    if (target.kind === 'collection') {
      const mapping = getFormMapping(target.mappingKey);
      if (!mapping) {
        throw new HttpsError('failed-precondition', `Unknown mapping: ${target.mappingKey}`);
      }

      // defaults always win (highest precedence) — prevents submission-tampering
      const record: Record<string, unknown> = {
        ...payload.values,
        ...(mapping.defaults ?? {}),
        tenants: [payload.tenantId],
        submittedAt: payload.meta.submittedAt,
        isSpam,
        formKey: payload.formKey,
      };

      const docRef = await db.collection(target.collectionName).add(record);
      submissionId = docRef.id;
      collectionName = target.collectionName;

      logger.info(`${CF_NAME}: wrote submission ${submissionId} to ${target.collectionName}`);

    } else {
      // URL target — POST as form-urlencoded
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(payload.values)) {
        body.set(k, String(v ?? ''));
      }

      const response = await fetch(target.url, {
        method: 'POST',
        body: body.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.ok) {
        logger.error(`${CF_NAME}: URL target ${target.url} returned ${response.status}`);
        throw new HttpsError('internal', `Submission to external URL failed (HTTP ${response.status})`);
      }

      submissionId = crypto.randomUUID();
      targetUrl = target.url;

      logger.info(`${CF_NAME}: forwarded submission to ${target.url}`);
    }

    // ── 6. Audit log ─────────────────────────────
    const durationMs = Date.now() - startMs;
    const activityDoc = {
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
        durationMs,
        userAgentFingerprint: payload.meta.userAgentFingerprint,
      }),
      index: `t:${getTodayStr(DateFormat.StoreDateTime)} c:form a:submission`,
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection('activities').add(activityDoc);

    // ── 7. Side effects (tasks, email) — Phase 5 ──
    // (skipped)

    // ── 8. Respond ────────────────────────────────
    return { submissionId };
  }
);

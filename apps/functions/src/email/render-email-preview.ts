// apps/functions/src/email/render-email-preview.ts
//
// What a mail will look like, rendered by the same renderer that sends it (design 7.8). Two callers:
// the composer, which has a body and a layout choice, and the template builder, which has a template
// document and the version it is editing (a draft included).
import { getFirestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { EmailLayoutChoice } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles } from '@okr/shared-util-functions';

import { callerMaySendFor } from '../auth';
import { composeBody, EmailTemplateError, firestoreTemplateReader, RenderedEmail, renderEmail } from './render-email';
import { answerBlockHtml, AnswerEventLine } from './personal-mail.logic';
import { asLayoutChoice, StoredTemplate } from './render-email.logic';

const REGION = 'europe-west6';
const CF_NAME = 'renderEmailPreview';

/** A body of the composer, or a template of the builder; `body` wins when both are given. */
export interface RenderPreviewRequest {
  /** The app the mail would be sent for, as `sendEmail` gets it. */
  appId: string;
  layout?: EmailLayoutChoice;
  body?: string;
  attachmentName?: string;
  /** The events of a Versand with answer links: the preview shows the answer block under the body. */
  answerEvents?: AnswerEventLine[];
  templateKey?: string;
  version?: number;
}

/** What a layout preview shows inside the layout, so the builder sees header and footer around real text. */
const SAMPLE_BODY = '<p>Hallo,</p><p>so sieht deine Nachricht in diesem Rahmen aus.</p><p>Freundliche Grüsse</p>';

/**
 * The template's `sampleData` (a JSON string) as render variables. Anything that is not a flat object
 * of strings, numbers and booleans gives `{}`: a broken sample must not stop a preview.
 */
export function parseSampleData(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const variables: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') variables[name] = String(value);
  }
  return variables;
}

/** A tenant may preview its own templates and the shared (`system`) ones, nobody else's. */
export function mayPreviewTemplate(doc: Pick<StoredTemplate, 'tenants'> | undefined, tenantId: string): boolean {
  const tenants = doc?.tenants ?? [];
  return tenants.includes(tenantId) || tenants.includes('system');
}

/** Template problems carry a safe message; anything else is not shown to the caller. */
function previewError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof EmailTemplateError) return new HttpsError('failed-precondition', error.message);
  return new HttpsError('failed-precondition', 'Die Vorschau konnte nicht aufgebaut werden.');
}

/** The tenant the send would use, so the preview shows that tenant's layout, under the same check as `sendEmail`. */
async function previewTenant(request: CallableRequest<RenderPreviewRequest>): Promise<string> {
  const appId = request.data?.appId;
  if (typeof appId !== 'string' || !appId) throw new HttpsError('invalid-argument', 'appId is required.');
  const caller = await getFirestore().collection('users').doc(request.auth?.uid ?? '').get();
  if (!callerMaySendFor(caller.data(), appId)) {
    logger.warn(`${CF_NAME}: refused, caller ${request.auth?.uid} is not a member of the requested app`);
    throw new HttpsError('permission-denied', 'Du kannst für diese App keine Vorschau ansehen.');
  }
  return appId;
}

async function previewTemplate(request: CallableRequest<RenderPreviewRequest>, tenantId: string): Promise<RenderedEmail> {
  await checkRoles(request as never, CF_NAME, ['privileged', 'contentAdmin']);
  const { templateKey, version } = request.data;
  if (typeof templateKey !== 'string' || !templateKey || typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new HttpsError('invalid-argument', 'templateKey and a version of 1 or more are required.');
  }
  const { doc, version: stored } = await firestoreTemplateReader(templateKey, version);
  // The tenant first: a template that is foreign or missing answers the same, whatever its versions are.
  if (!mayPreviewTemplate(doc, tenantId)) {
    logger.warn(`${CF_NAME}: tenant ${tenantId} may not preview ${templateKey}`);
    throw new HttpsError('permission-denied', 'Diese Vorlage gehört zu einer anderen App.');
  }
  if (!doc || !stored) throw new HttpsError('not-found', 'The version does not exist.');
  const previewVersion = { okey: templateKey, version };
  if (doc.kind === 'emailLayout') {
    return renderEmail({ tenantId, layout: 'standard', body: SAMPLE_BODY, includeContact: true, previewVersion });
  }
  if (doc.kind === 'emailText') {
    return renderEmail({ tenantId, layout: 'standard', textKey: templateKey, variables: parseSampleData(doc.sampleData), previewVersion });
  }
  throw new HttpsError('invalid-argument', 'Only email templates can be previewed here.');
}

export const renderEmailPreview = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '256MiB' },
  async (request: CallableRequest<RenderPreviewRequest>): Promise<RenderedEmail> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await previewTenant(request);
    const data = request.data;
    try {
      if (data.body !== undefined) {
        if (typeof data.body !== 'string') throw new HttpsError('invalid-argument', 'body must be a string.');
        const events = (Array.isArray(data.answerEvents) ? data.answerEvents : []).filter((e) => e && typeof e === 'object')
          .map((e) => ({ name: String(e.name ?? ''), when: String(e.when ?? '') }));
        const body = events.length > 0 ? data.body + answerBlockHtml('#', events) : data.body;
        return await composeBody(tenantId, { body, layout: asLayoutChoice(data.layout), attachmentName: data.attachmentName });
      }
      if (data.templateKey !== undefined) return await previewTemplate(request, tenantId);
    } catch (error) {
      if (!(error instanceof HttpsError)) logger.error(`${CF_NAME}: the preview failed (tenant ${tenantId})`, { error: error instanceof Error ? error.message : String(error) });
      throw previewError(error);
    }
    throw new HttpsError('invalid-argument', 'A body or a templateKey is required.');
  },
);

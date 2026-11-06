// apps/functions/src/email/render-email-preview.ts
//
// What a mail will look like, rendered by the same renderer that sends it (design 7.8). Two callers:
// the composer, which has a body and a layout choice, and the template builder, which has a template
// document and the version it is editing (a draft included).
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { EmailLayoutChoice } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { composeBody, EmailTemplateError, firestoreTemplateReader, RenderedEmail, renderEmail } from './render-email';
import { asLayoutChoice, StoredTemplate } from './render-email.logic';

const REGION = 'europe-west6';
const CF_NAME = 'renderEmailPreview';

/** A body of the composer, or a template of the builder; `body` wins when both are given. */
export interface RenderPreviewRequest {
  layout?: EmailLayoutChoice;
  body?: string;
  attachmentName?: string;
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

async function previewTemplate(request: CallableRequest<RenderPreviewRequest>, tenantId: string): Promise<RenderedEmail> {
  await checkRoles(request as never, CF_NAME, ['privileged', 'contentAdmin']);
  const { templateKey, version } = request.data;
  if (typeof templateKey !== 'string' || !templateKey || typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new HttpsError('invalid-argument', 'templateKey and a version of 1 or more are required.');
  }
  const { doc, version: stored } = await firestoreTemplateReader(templateKey, version);
  if (!doc || !stored) throw new HttpsError('not-found', 'The template or its version does not exist.');
  if (!mayPreviewTemplate(doc, tenantId)) {
    logger.warn(`${CF_NAME}: tenant ${tenantId} may not preview ${templateKey}`);
    throw new HttpsError('permission-denied', 'Diese Vorlage gehört zu einer anderen App.');
  }
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
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const data = request.data ?? {};
    try {
      if (data.body !== undefined) {
        if (typeof data.body !== 'string') throw new HttpsError('invalid-argument', 'body must be a string.');
        const attachmentName = typeof data.attachmentName === 'string' && data.attachmentName.trim() ? data.attachmentName.trim() : undefined;
        return await composeBody(tenantId, { body: data.body, layout: asLayoutChoice(data.layout), attachmentName });
      }
      if (data.templateKey !== undefined) return await previewTemplate(request, tenantId);
    } catch (error) {
      if (!(error instanceof HttpsError)) logger.error(`${CF_NAME}: the preview failed (tenant ${tenantId})`, { error: error instanceof Error ? error.message : String(error) });
      throw previewError(error);
    }
    throw new HttpsError('invalid-argument', 'A body or a templateKey is required.');
  },
);

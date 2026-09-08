// apps/functions/src/pdf/generate-document.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { checkRateLimit } from './rate-limiter';
import { resolveIsAdmin } from './resolve-admin';
import { renderDocument } from './render-document';
import type { GenerateDocumentRequest, GenerateDocumentResponse } from './render-document';

export type { GenerateDocumentRequest, GenerateDocumentResponse } from './render-document';

export const generateDocument = onCall<GenerateDocumentRequest, Promise<GenerateDocumentResponse>>(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    memory: '2GiB',
    timeoutSeconds: 120,
    minInstances: 1,
    maxInstances: 10,
    concurrency: 1,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { templateId, html: rawHtml, options = {} } = request.data;

    if (!templateId && !rawHtml) {
      throw new HttpsError('invalid-argument', 'Provide either templateId or html');
    }
    if (templateId && rawHtml) {
      throw new HttpsError('invalid-argument', 'Provide either templateId or html, not both');
    }

    const userId = request.auth.uid;
    const tenantId = typeof request.auth.token['tenantId'] === 'string'
      ? request.auth.token['tenantId']
      : 'default';
    const isAdmin: boolean = await resolveIsAdmin(
      userId,
      request.auth.token as unknown as Record<string, unknown>
    );

    // Only admin/contentAdmin may use raw-HTML mode
    if (rawHtml && !isAdmin) {
      throw new HttpsError('permission-denied', 'Raw HTML mode requires admin or contentAdmin role');
    }

    const storageMode = options.storageMode ?? 'persist';

    // Rate limit (skip for ephemeral/preview calls)
    if (storageMode !== 'ephemeral') {
      await checkRateLimit(userId, isAdmin);
    }

    return renderDocument(request.data ?? {}, userId, tenantId);
  }
);

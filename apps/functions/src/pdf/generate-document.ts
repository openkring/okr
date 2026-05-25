// apps/functions/src/pdf/generate-document.ts
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import Handlebars from 'handlebars';
// @ts-expect-error html-to-docx lacks type declarations
import HtmlToDocx from 'html-to-docx';

import {
  TemplateCollection,
  TemplateVersionSubcollection,
  DocGenerationCollection,
  TemplateModel,
  TemplateVersionModel,
  DocGenerationModel,
} from '@bk2/shared-models';
import { registerHelpers } from './handlebars-helpers';
import { getBrowser } from './browser-pool';
import { compileTemplate } from './template-cache';
import { resolveAssetUrls } from './asset-resolver';
import { checkRateLimit } from './rate-limiter';
import { sanitizeHtml } from './sanitize';

// Register helpers once at cold-start
registerHelpers();

export interface GenerateDocumentRequest {
  templateId?: string;
  templateVersion?: number;
  payload?: Record<string, unknown>;
  html?: string;
  options?: {
    outputFormat?: 'pdf' | 'docx' | 'html';
    format?: 'A4' | 'A5' | 'Letter';
    orientation?: 'portrait' | 'landscape';
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
    filename?: string;
    storageMode?: 'persist' | 'ephemeral';
    metadata?: { entityType?: string; entityId?: string };
  };
}

export interface GenerateDocumentResponse {
  url: string;
  storagePath: string;
  filename: string;
  sizeBytes: number;
  outputFormat: 'pdf' | 'docx' | 'html';
  generatedAt: string;
  templateVersion?: number;
  generationId: string;
}

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

    const { templateId, html: rawHtml, payload = {}, options = {} } = request.data;

    if (!templateId && !rawHtml) {
      throw new HttpsError('invalid-argument', 'Provide either templateId or html');
    }
    if (templateId && rawHtml) {
      throw new HttpsError('invalid-argument', 'Provide either templateId or html, not both');
    }

    const userId = request.auth.uid;
    const tenantId: string = (request.auth.token['tenantId'] as string) ?? 'default';
    const isAdmin: boolean =
      request.auth.token['admin'] === true ||
      request.auth.token['contentAdmin'] === true;

    const outputFormat = options.outputFormat ?? 'pdf';
    const storageMode = options.storageMode ?? 'persist';
    const generationId = randomUUID();
    const startMs = Date.now();

    // Rate limit (skip for ephemeral/preview calls)
    if (storageMode !== 'ephemeral') {
      await checkRateLimit(userId, isAdmin);
    }

    let htmlToRender: string;
    let resolvedVersion: number | undefined;
    let templateName = 'document';

    if (templateId) {
      // — Template mode —
      const db = getFirestore();
      const templateSnap = await db.collection(TemplateCollection).doc(templateId).get();
      if (!templateSnap.exists) {
        throw new HttpsError('not-found', `Template ${templateId} not found`);
      }
      const tmpl = templateSnap.data() as TemplateModel;

      if (tmpl.status === 'archived') {
        throw new HttpsError('failed-precondition', 'Template is archived');
      }
      if (!tmpl.currentVersion && tmpl.status !== 'draft') {
        throw new HttpsError('failed-precondition', 'Template has no published version');
      }

      resolvedVersion = request.data.templateVersion ?? tmpl.currentVersion;
      templateName = tmpl.name;

      const versionSnap = await db
        .collection(TemplateCollection)
        .doc(templateId)
        .collection(TemplateVersionSubcollection)
        .doc(String(resolvedVersion))
        .get();

      if (!versionSnap.exists) {
        throw new HttpsError('not-found', `Template version ${resolvedVersion} not found`);
      }
      const version = versionSnap.data() as TemplateVersionModel;

      // Resolve asset signed URLs and register assetUrl helper per-request
      const assetUrls = await resolveAssetUrls(version.assets ?? []);
      Handlebars.registerHelper('assetUrl', (key: string) => assetUrls[key] ?? '');

      // Compile template (cached)
      const cacheKey = `${templateId}@${resolvedVersion}`;
      const compiled = compileTemplate(cacheKey, version.html, version.css);

      // Register partials
      for (const [name, content] of Object.entries(version.partials ?? {})) {
        Handlebars.registerPartial(name, content);
      }

      htmlToRender = compiled(payload);
    } else {
      // — Raw HTML mode —
      htmlToRender = sanitizeHtml(rawHtml!);
    }

    // Generate output
    const ext = outputFormat === 'pdf' ? 'pdf' : outputFormat === 'docx' ? 'docx' : 'html';
    const filename = options.filename ?? `${templateName}-${Date.now()}.${ext}`;
    const tempPath = path.join(os.tmpdir(), `${generationId}.${ext}`);

    try {
      if (outputFormat === 'pdf') {
        const browser = await getBrowser();
        const page = await browser.newPage();
        try {
          await page.setContent(htmlToRender, { waitUntil: 'networkidle0' });
          await page.pdf({
            path: tempPath,
            format: (options.format ?? 'A4') as 'A4' | 'A5' | 'Letter',
            landscape: options.orientation === 'landscape',
            printBackground: true,
            margin: options.margin ?? { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
          });
        } finally {
          await page.close();
        }
      } else if (outputFormat === 'docx') {
        const docxBuffer = await HtmlToDocx(htmlToRender, undefined, {
          table: { row: { cantSplit: true } },
          footer: true,
          pageNumber: true,
        });
        fs.writeFileSync(tempPath, docxBuffer);
      } else {
        fs.writeFileSync(tempPath, htmlToRender, 'utf8');
      }

      const sizeBytes = fs.statSync(tempPath).size;
      const storagePath = storageMode === 'persist'
        ? `generated-docs/${tenantId}/${userId}/${generationId}.${ext}`
        : `generated-docs-ephemeral/${tenantId}/${generationId}.${ext}`;

      const bucket = getStorage().bucket();
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        html: 'text/html',
      };
      await bucket.upload(tempPath, {
        destination: storagePath,
        metadata: { contentType: mimeTypes[outputFormat] },
      });

      const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
        action: 'read',
        expires: Date.now() + 3600_000, // 1 hour
      });

      const durationMs = Date.now() - startMs;

      // Write audit entry (skip for ephemeral)
      if (storageMode === 'persist') {
        const audit: Partial<DocGenerationModel> = {
          bkey: generationId,
          tenants: [tenantId],
          userId,
          templateId: templateId ?? '',
          templateVersion: resolvedVersion ?? 0,
          outputFormat,
          status: 'success',
          storagePath,
          filename,
          sizeBytes,
          durationMs,
          entityType: options.metadata?.entityType ?? '',
          entityId: options.metadata?.entityId ?? '',
          createdAt: new Date().toISOString(),
        };
        await getFirestore().collection(DocGenerationCollection).doc(generationId).set(audit);
      }

      logger.info('generateDocument: success', { generationId, durationMs, outputFormat, sizeBytes });

      return {
        url: signedUrl,
        storagePath,
        filename,
        sizeBytes,
        outputFormat,
        generatedAt: new Date().toISOString(),
        templateVersion: resolvedVersion,
        generationId,
      };

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('generateDocument: failed', { generationId, message });

      if (storageMode === 'persist') {
        await getFirestore().collection(DocGenerationCollection).doc(generationId).set({
          bkey: generationId,
          tenants: [tenantId],
          userId,
          templateId: templateId ?? '',
          outputFormat,
          status: 'failed',
          errorMessage: message,
          durationMs: Date.now() - startMs,
          createdAt: new Date().toISOString(),
        }).catch(() => undefined);
      }

      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', message);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
);

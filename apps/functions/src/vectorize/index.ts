import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { DocumentRendering, renderingPath, upsertRendering } from './vectorize-path.util';

const REGION = 'europe-west6';
const DOCS_COLLECTION = 'docs';

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png'];
/** Guard against runaway cost, not a considered limit — raise it if a legitimate source is rejected. */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_FILTER_SPECKLE = 4;

export type VectorizePreset = 'logo' | 'photo';

interface VectorizeRequest {
  docKey: string;
  tenantId: string;
  preset?: VectorizePreset;
  detail?: number;
}

/**
 * Vectorize a JPG/PNG document into an SVG rendering (vtracer via @neplex/vectorizer).
 *
 * Two presets plus one knob — vtracer's dozen parameters are a configuration surface nobody uses
 * correctly, but no adjustment at all makes an 80%-right trace unusable. `detail` maps onto
 * filterSpeckle: lower keeps more small shapes, higher traces cleaner but coarser.
 *
 * Idempotent: re-running overwrites both the Storage object and the `renderings[]` entry, which is
 * what makes the "tune and regenerate until it looks right" loop in the modal work.
 */
export const vectorizeDocument = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120 },
  async (request: CallableRequest<VectorizeRequest>): Promise<DocumentRendering> => {
    checkAppCheckToken(request as any, 'vectorizeDocument');
    checkAuthentication(request as any, 'vectorizeDocument');

    const { docKey, tenantId, preset = 'logo', detail } = request.data ?? ({} as VectorizeRequest);
    if (!docKey) throw new HttpsError('invalid-argument', 'docKey is required');
    if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId is required');

    const db = getFirestore();
    const docRef = db.collection(DOCS_COLLECTION).doc(docKey);
    const snap = await docRef.get();
    const doc = snap.data();
    if (!doc) throw new HttpsError('not-found', `document ${docKey} not found`);

    // A caller may not vectorize another tenant's document.
    if (!((doc['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('permission-denied', 'document does not belong to this tenant');
    }
    const mimeType = (doc['mimeType'] as string | undefined) ?? '';
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      throw new HttpsError('failed-precondition', `cannot vectorize mimeType "${mimeType}"`);
    }
    const size = Number(doc['size'] ?? 0);
    if (size > MAX_INPUT_BYTES) {
      throw new HttpsError('failed-precondition', `source is larger than ${MAX_INPUT_BYTES} bytes`);
    }
    const sourcePath = (doc['fullPath'] as string | undefined) ?? '';
    if (!sourcePath) throw new HttpsError('failed-precondition', 'document has no fullPath');

    const bucket = admin.storage().bucket();
    const [source] = await bucket.file(sourcePath).download();

    // Dynamic import: @neplex/vectorizer is a native addon, so it must not load at cold start of
    // every other function in this bundle (same reason as pdf/browser-pool.ts).
    const { vectorize, ColorMode, Hierarchical, PathSimplifyMode } = await import('@neplex/vectorizer');
    const svg = await vectorize(source, {
      colorMode: preset === 'photo' ? ColorMode.Color : ColorMode.Binary,
      hierarchical: Hierarchical.Stacked,
      mode: PathSimplifyMode.Spline,
      filterSpeckle: detail ?? DEFAULT_FILTER_SPECKLE,
      colorPrecision: 8,
      layerDifference: 5,
      cornerThreshold: 60,
      lengthThreshold: 4,
      maxIterations: 10,
      spliceThreshold: 45,
    });

    const fullPath = renderingPath(sourcePath, docKey, 'svg');
    const buffer = Buffer.from(svg, 'utf8');
    await bucket.file(fullPath).save(buffer, { contentType: 'image/svg+xml' });

    const rendering: DocumentRendering = {
      format: 'svg', fullPath, mimeType: 'image/svg+xml', size: buffer.byteLength, generator: 'vtracer',
    };
    await docRef.set(
      { renderings: upsertRendering(doc['renderings'] as DocumentRendering[] | undefined, rendering) },
      { merge: true },
    );

    logger.info(`vectorizeDocument: ${docKey} → ${fullPath} (${buffer.byteLength} bytes, preset=${preset})`);
    return rendering;
  },
);

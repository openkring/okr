/// <reference lib="dom" />
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, REGION,
  getDeepSignAccessToken, getEsignApiBase, downloadFromStorage, computeWebhookToken, getCallerTenants,
  mapDeepSignSignees, webhookSecret,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

export interface EsignSendDocumentRequest {
  storagePath: string;
  documentName?: string;
  initiatorAliasName: string;
  comment?: string;
  signatureMode?: 'timestamp' | 'advanced' | 'qualified';
  jurisdiction?: 'zertes' | 'eidas';
  sendMail?: 'all' | 'others' | 'none';
  source: 'user-upload' | 'cf-generated';
  sourceRef?: string;
}

export const esignSendDocument = onCall<EsignSendDocumentRequest>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const userId = request.auth.uid;
    // Derive the tenant from the caller's user doc — token.tenantId is never
    // minted in this project, so reading it yielded an empty tenant (H-5).
    const tenantId = (await getCallerTenants(userId))[0] ?? '';
    const {
      storagePath, initiatorAliasName, comment,
      signatureMode = 'timestamp', jurisdiction = 'zertes',
      sendMail = 'all', source, sourceRef,
    } = request.data;

    if (!storagePath) throw new HttpsError('invalid-argument', 'storagePath required');
    if (!initiatorAliasName) throw new HttpsError('invalid-argument', 'initiatorAliasName required');

    const filename = storagePath.split('/').pop() ?? 'document.pdf';
    const documentName = request.data.documentName ?? filename;

    const db = getFirestore();

    // Pre-create the esignList record with status 'uploading'
    const docRef = db.collection(EsignCollection).doc();
    const esignId = docRef.id;
    const now = Timestamp.now();
    await docRef.set({
      esignId,
      tenantId,
      ownerUserId: userId,
      source,
      ...(sourceRef ? { sourceRef } : {}),
      documentName,
      storagePath,
      deepsignDocumentId: '',
      documentStatus: 'uploading',
      signatureMode,
      jurisdiction,
      ...(comment ? { comment } : {}),
      initiatorAliasName,
      signees: [],
      events: [{ type: 'created', at: now }],
      createdAt: now,
      updatedAt: now,
    });

    try {
      // Download PDF and acquire token in parallel
      const [buffer, token] = await Promise.all([
        downloadFromStorage(storagePath),
        getDeepSignAccessToken(),
      ]);
      const apiBase = getEsignApiBase();

      const webhookToken = computeWebhookToken(esignId, webhookSecret.value());
      const projectId = process.env['GCLOUD_PROJECT'] ?? '';
      const webhookBase = `https://${REGION}-${projectId}.cloudfunctions.net/esignWebhook`;
      const webhookUrl = `${webhookBase}?esignId=${esignId}&token=${webhookToken}`;

      const docData = {
        initiatorAliasName,
        sendMail,
        ...(comment ? { comment } : {}),
        signatureMode,
        jurisdiction,
        scanPredefined: true,
        // DeepSign callback registration (per int OpenAPI: AddDocumentFile schema).
        // `callbacks`/`documentStatusUrl` are NOT real fields — DeepSign silently drops them.
        callbackUrl: webhookUrl,
        callbackEventTypes: ['signee-completed', 'document-completed'],
        callbackSecret: webhookSecret.value(),
      };

      const formData = new FormData();
      formData.set('data', new Blob([JSON.stringify(docData)], { type: 'application/json' }));
      formData.set('file', new Blob([buffer], { type: 'application/pdf' }), filename);

      // Upload to DeepSign
      const uploadResponse = await axios.post<{
        documentId: string;
        documentStatus: string;
        signees: unknown[];
        signeesOrdered: boolean;
        creationTime: string;
      }>(
        `${apiBase}/documents/file`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const { documentId, signees, creationTime } = uploadResponse.data;
      // DeepSign's raw signees carry nested-array properties Firestore rejects; project
      // onto our flat EsignSignee shape before persisting/returning.
      const mappedSignees = mapDeepSignSignees(signees);

      // NB: do NOT persist DeepSign's raw `signeesOrdered` — it is not part of EsignRecord
      // and DeepSign returns it as a nested-array ordering structure, which Firestore rejects.
      await docRef.update({
        deepsignDocumentId: documentId,
        documentStatus: 'draft',
        signees: mappedSignees,
        deepsignCreationTime: String(creationTime ?? ''),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Start the signing process
      await axios.put(
        `${apiBase}/documents/${documentId}/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const startedAt = Timestamp.now();
      await docRef.update({
        documentStatus: 'in-progress',
        startedAt,
        updatedAt: FieldValue.serverTimestamp(),
        events: FieldValue.arrayUnion({ type: 'started', at: startedAt }),
      });

      logger.info('esignSendDocument: started', { esignId, documentId });
      return { esignId, documentId, signees: mappedSignees };

    } catch (err: unknown) {
      // Surface DeepSign's actual error body (axios only exposes "status code NNN" in .message).
      const message = axios.isAxiosError(err) && err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : err instanceof Error ? err.message : String(err);
      await docRef.update({
        documentStatus: 'error',
        errorMessage: message,
        updatedAt: FieldValue.serverTimestamp(),
        events: FieldValue.arrayUnion({ type: 'error', at: Timestamp.now(), payload: { message } }),
      });
      logger.error('esignSendDocument: failed', { esignId, error: message });
      throw new HttpsError('internal', `DeepSign upload failed: ${message}`);
    }
  },
);

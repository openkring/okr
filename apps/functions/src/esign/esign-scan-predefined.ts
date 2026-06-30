import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, REGION,
  getDeepSignAccessToken, getEsignApiBase, downloadFromStorage, getCallerTenants,
} from './shared';

interface ScanPredefinedRequest { storagePath: string }

export const esignScanPredefined = onCall<ScanPredefinedRequest>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { storagePath } = request.data;
    if (!storagePath) throw new HttpsError('invalid-argument', 'storagePath required');

    // The function downloads storagePath via the Admin SDK (bypassing Storage
    // rules), so restrict it to the caller's own tenant prefix — otherwise any
    // authenticated user could read any object by naming its path (H-5).
    const tenants = await getCallerTenants(request.auth.uid);
    const inTenant = tenants.some(
      (t) => storagePath.startsWith(`tenant/${t}/`) || storagePath.startsWith(`tenants/${t}/`),
    );
    if (!inTenant) throw new HttpsError('permission-denied', 'storagePath is outside your tenant.');

    const token = await getDeepSignAccessToken();

    const buffer = await downloadFromStorage(storagePath);
    const filename = storagePath.split('/').pop() ?? 'document.pdf';

    const formData = new FormData();
    formData.set('file', new Blob([buffer], { type: 'application/pdf' }), filename);

    const response = await axios.post(
      `${getEsignApiBase()}/documents/file/scan-predefined`,
      formData,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    logger.info('esignScanPredefined: scan complete', { storagePath, fields: response.data?.signatureFields?.length });
    return response.data;
  },
);

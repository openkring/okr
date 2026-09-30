import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { validVoucherKeys, VoucherView, voucherView } from './voucher-view';

const CF_NAME = 'signFinanceDocuments';
const URL_TTL_MS = 10 * 60 * 1000;

/**
 * Signed, short-lived links to vouchers in the private bucket (spec 1.74 Phase 2, voucher view).
 * Treasurer/privileged only; documents of another tenant are silently left out. The files never
 * pass through the public imgix source — thumbnails of images come from the signed original;
 * PDF page thumbnails follow once the private imgix source exists.
 */
export const signFinanceDocuments = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ documentKeys?: string[] }>): Promise<{ vouchers: (VoucherView & { url: string })[] }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer', 'privileged']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const keys = validVoucherKeys(request.data?.documentKeys);
    if (keys.length === 0) return { vouchers: [] };

    const db = getFirestore();
    const snaps = await db.getAll(...keys.map(k => db.collection(FinanceDocumentCollection).doc(k)));
    const views = snaps.map((s, i) => voucherView(keys[i], s.data(), [tenantId])).filter((v): v is VoucherView => v !== null);
    const expires = Date.now() + URL_TTL_MS;
    const vouchers = await Promise.all(views.map(async v => {
      const [url] = await privateBucket().file(v.path).getSignedUrl({
        version: 'v4', action: 'read', expires,
        responseDisposition: `inline; filename="${v.name.replace(/[^\x20-\x7e]|"/g, '_')}"`,
      });
      return { ...v, url };
    }));
    logger.info(`${CF_NAME}: signed ${vouchers.length}/${keys.length} voucher(s) for tenant ${tenantId}`);
    return { vouchers };
  },
);

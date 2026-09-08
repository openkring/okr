// apps/functions/src/user/migrate-delivery-channels.ts
//
// One-off: users.newsDelivery / .invoiceDelivery were a numeric DeliveryType and become a
// list of DeliveryChannel (planning/specs/2026-09-07-delivery-channels-spec.md §1.4).
//
// Run once per tenant after the release. Until it has run, toDeliveryChannels() in
// @okr/shared-util-core absorbs the old numbers on every read — this function only stops
// that fallback from having to work forever.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { UserCollection } from '@okr/shared-models';
import { toDeliveryChannels } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkAdminRole } from '@okr/shared-util-functions';

const REGION = 'europe-west6';

interface MigrateRequest { tenantId?: string; dryRun?: boolean }
interface MigrateResponse { scanned: number; updated: number; skipped: number }

/**
 * One-time, idempotent migration of users.newsDelivery / .invoiceDelivery from the legacy
 * numeric DeliveryType to a DeliveryChannel[] list. Admin-only. Safe to re-run: any doc
 * already holding arrays for both fields is skipped.
 */
export const migrateDeliveryChannels = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<MigrateResponse> => {
    checkAppCheckToken(request, 'migrateDeliveryChannels');
    checkAuthentication(request, 'migrateDeliveryChannels');
    await checkAdminRole(request, 'migrateDeliveryChannels');

    const data = request.data as MigrateRequest;
    const tenantId = (data?.tenantId ?? '').trim();
    if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId is mandatory');
    const dryRun = data?.dryRun === true;

    const db = getFirestore();
    const snap = await db.collection(UserCollection).where('tenants', 'array-contains', tenantId).get();

    let updated = 0;
    let skipped = 0;
    for (const doc of snap.docs) {
      const docData = doc.data() as Record<string, unknown>;
      const news = docData['newsDelivery'];
      const invoice = docData['invoiceDelivery'];
      if (Array.isArray(news) && Array.isArray(invoice)) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        await doc.ref.update({
          newsDelivery: toDeliveryChannels(news),
          invoiceDelivery: toDeliveryChannels(invoice),
        });
      }
      updated++;
    }

    const result: MigrateResponse = { scanned: snap.size, updated, skipped };
    logger.info('migrateDeliveryChannels: done', { tenantId, dryRun, ...result });
    return result;
  },
);

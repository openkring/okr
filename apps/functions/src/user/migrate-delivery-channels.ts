// apps/functions/src/user/migrate-delivery-channels.ts
//
// One-off: users.newsDelivery / .invoiceDelivery were a numeric DeliveryType and become a
// list of DeliveryChannel (planning/specs/2026-09-07-delivery-channels-spec.md §1.4).
//
// Run once after the release. Until it has run, toDeliveryChannels() in
// @okr/shared-util-core absorbs the old numbers on every read — this function only stops
// that fallback from having to work forever.

import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { UserCollection } from '@okr/shared-models';
import { toDeliveryChannels } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkAdminRole } from '@okr/shared-util-functions';

const REGION = 'europe-west6';

/** well under Firestore's 500-write ceiling, same size the sibling backfills use */
const BATCH = 400;

interface MigrateRequest { tenantId?: string; dryRun?: boolean }
interface MigrateResponse { scanned: number; updated: number; skipped: number }

/**
 * One-time, idempotent migration of users.newsDelivery / .invoiceDelivery from the legacy
 * numeric DeliveryType to a DeliveryChannel[] list. Admin-only.
 *
 * `tenantId` is OPTIONAL and omitting it is the normal way to run this: the conversion does
 * not depend on the tenant, so one unscoped pass over `users` migrates the whole estate at
 * once — and it is the only variant that also catches a document whose `tenants` array is
 * empty or holds a tenant nobody thought to name. Pass a `tenantId` only for a deliberately
 * narrowed run.
 *
 * Safe to re-run: a document already holding arrays for both fields is skipped, so a second
 * call reports everything as skipped and writes nothing. `dryRun` counts without writing.
 */
export const migrateDeliveryChannels = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540, memory: '512MiB' },
  async (request): Promise<MigrateResponse> => {
    checkAppCheckToken(request, 'migrateDeliveryChannels');
    checkAuthentication(request, 'migrateDeliveryChannels');
    await checkAdminRole(request, 'migrateDeliveryChannels');

    const data = request.data as MigrateRequest;
    const tenantId = (data?.tenantId ?? '').trim();
    const dryRun = data?.dryRun === true;

    const db = getFirestore();
    const users = db.collection(UserCollection);
    const snap = await (tenantId ? users.where('tenants', 'array-contains', tenantId).get() : users.get());

    let updated = 0;
    let skipped = 0;
    let batch = db.batch();
    let pending = 0;

    for (const doc of snap.docs) {
      const docData = doc.data() as Record<string, unknown>;
      const news = docData['newsDelivery'];
      const invoice = docData['invoiceDelivery'];
      if (Array.isArray(news) && Array.isArray(invoice)) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        batch.update(doc.ref, {
          newsDelivery: toDeliveryChannels(news),
          invoiceDelivery: toDeliveryChannels(invoice),
        });
        if (++pending >= BATCH) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
      updated++;
    }
    if (pending > 0) await batch.commit();

    const result: MigrateResponse = { scanned: snap.size, updated, skipped };
    logger.info('migrateDeliveryChannels: done', { tenantId: tenantId || 'all tenants', dryRun, ...result });
    return result;
  },
);

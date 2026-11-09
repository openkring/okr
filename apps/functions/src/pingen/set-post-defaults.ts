// apps/functions/src/pingen/set-post-defaults.ts
//
// «Als Vorgabe speichern» of the Post step (spec 1.150): an administrator of a tenant stores the letter options as
// the tenant's default (`app-config/{tenantId}.postDeliveryProduct / postPrintSpectrum / postPrintMode`).

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { PostOptions } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { callerIsAdmin } from '../collection/payment-method';

const REGION = 'europe-west6';

/** Strict, unlike the quote's `parseOptions`: a default is stored, so an unknown value is refused, not replaced. */
export function validatePostOptions(raw: unknown): PostOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const { deliveryProduct, printSpectrum, printMode } = o;
  if (deliveryProduct !== 'fast' && deliveryProduct !== 'cheap') throw new HttpsError('invalid-argument', 'deliveryProduct must be fast or cheap');
  if (printSpectrum !== 'color' && printSpectrum !== 'grayscale') throw new HttpsError('invalid-argument', 'printSpectrum must be color or grayscale');
  if (printMode !== 'simplex' && printMode !== 'duplex') throw new HttpsError('invalid-argument', 'printMode must be simplex or duplex');
  return { deliveryProduct, printSpectrum, printMode };
}

export interface SetPostDefaultsDeps {
  callerIsAdmin(): Promise<boolean>;
  callerTenantId(): Promise<string>;
  /** false = the tenant has no app-config */
  writeDefaults(tenantId: string, options: PostOptions): Promise<boolean>;
}

/** The caller must be an admin of exactly the tenant whose defaults change. */
export async function setPostDefaultsCore(deps: SetPostDefaultsDeps, data: { tenantId?: unknown; options?: unknown } | undefined): Promise<{ ok: true }> {
  const tenantId = data?.tenantId;
  if (typeof tenantId !== 'string' || tenantId === '') throw new HttpsError('invalid-argument', 'tenantId is required');
  if (!(await deps.callerIsAdmin())) throw new HttpsError('permission-denied', 'This operation requires the admin role.');
  if ((await deps.callerTenantId()) !== tenantId) throw new HttpsError('permission-denied', 'You are not an administrator of that tenant.');
  const options = validatePostOptions(data?.options);
  if (!(await deps.writeDefaults(tenantId, options))) throw new HttpsError('not-found', 'The tenant has no configuration.');
  return { ok: true };
}

export const setPostDefaults = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ tenantId?: unknown; options?: unknown }>): Promise<{ ok: true }> => {
    const CF_NAME = 'setPostDefaults';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    const result = await setPostDefaultsCore({
      callerIsAdmin: () => callerIsAdmin(db, request),
      callerTenantId: () => getCallerTenantId(request as never, CF_NAME),
      writeDefaults: async (tenantId, o) => {
        const ref = db.collection('app-config').doc(tenantId);
        if (!(await ref.get()).exists) return false;
        await ref.update({ postDeliveryProduct: o.deliveryProduct, postPrintSpectrum: o.printSpectrum, postPrintMode: o.printMode });
        return true;
      },
    }, request.data);
    logger.info(`${CF_NAME}: tenant ${(request.data as { tenantId?: string }).tenantId} post defaults changed by ${request.auth?.uid}`);
    return result;
  },
);

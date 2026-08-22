import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { UserCollection } from '@okr/shared-models';
import type { AliasTargetType, AliasTrackingSetting } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { assertMayMint, assertTargetAcceptable, loadSpace, mintAlias } from './mint-alias';
import { appBaseUrl, shortUrl } from './tenant-domains';

const REGION = 'europe-west6';

export interface CreateAliasRequest {
  tenantId?: string;
  space?: string;
  targetType?: AliasTargetType;
  targetUrl?: string;
  targetKey?: string;
  original?: string;
  notes?: string;
  alias?: string;
  validUntil?: string;
  maxUses?: number;
  trackingLevel?: AliasTrackingSetting;
}

export interface CreateAliasResponse {
  alias: string;
  url: string;
}

/** Wer ruft, und darf er in diesem Tenant überhaupt etwas? */
export async function resolveCaller(uid: string, tenantId: string): Promise<{
  roles: Record<string, boolean>;
  personKey: string;
}> {
  const snap = await getFirestore().collection(UserCollection).doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'No user document for the caller.');
  }
  const data = snap.data() ?? {};
  const tenants: string[] = data['tenants'] ?? [];
  if (!tenants.includes(tenantId)) {
    throw new HttpsError('permission-denied', 'Caller does not belong to this tenant.');
  }
  return {
    roles: (data['roles'] ?? {}) as Record<string, boolean>,
    personKey: String(data['personKey'] ?? ''),
  };
}

/**
 * `createAlias` — prägt **immer** einen neuen Code.
 *
 * Das ist kein Versehen, sondern der Messpunkt-Fall: das Plakat im Bootshaus, der Flyer, der
 * März- und der Juni-Newsletter zeigen auf dasselbe Ziel und sollen getrennt zählen,
 * unterschieden durch `notes`. Wer den Alias als *Identität* des Ziels will, ruft
 * `resolveAlias` — die Entscheidung trifft der Aufrufer per Operation, nicht per Flag
 * (Spec, Entscheid 4).
 */
export const createAlias = onCall<CreateAliasRequest, Promise<CreateAliasResponse>>(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    checkAppCheckToken(request, 'createAlias');
    checkAuthentication(request, 'createAlias');

    const tenantId = request.data?.tenantId?.trim();
    const spaceName = request.data?.space?.trim();
    if (!tenantId) throw new HttpsError('invalid-argument', 'createAlias requires a tenantId.');
    if (!spaceName) throw new HttpsError('invalid-argument', 'createAlias requires a space.');

    const db = getFirestore();
    const { roles, personKey } = await resolveCaller(request.auth?.uid ?? '', tenantId);

    const space = await loadSpace(db, tenantId, spaceName);
    assertMayMint(space, roles);

    const targetType = request.data?.targetType ?? 'url';
    const targetUrl = request.data?.targetUrl ?? '';
    const targetKey = request.data?.targetKey ?? '';
    assertTargetAcceptable(space, targetType, targetUrl, targetKey);

    const minted = await mintAlias(db, {
      tenantId,
      space,
      targetType,
      targetUrl,
      targetKey,
      original: request.data?.original ?? targetUrl,
      notes: request.data?.notes ?? '',
      // Ein Alias ohne personKey ist möglich (Dienstkonto) — dann bleibt createdBy leer,
      // statt eine Person zu erfinden, die in einer Datenauskunft auftauchen würde.
      createdBy: personKey ? `person.${personKey}` : '',
      now: getTodayStr(DateFormat.StoreDateTime),
      requestedAlias: request.data?.alias?.trim() || undefined,
      validUntil: request.data?.validUntil,
      maxUses: request.data?.maxUses,
      trackingLevel: request.data?.trackingLevel,
    });

    logger.info(`createAlias: ${tenantId}/${spaceName}/${minted.alias}`);
    return {
      alias: minted.alias,
      url: shortUrl(await appBaseUrl(tenantId), space.name, minted.alias),
    };
  },
);

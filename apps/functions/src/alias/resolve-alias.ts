import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { AliasCollection } from '@okr/shared-models';
import type { AliasModel, AliasTargetType } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { resolveCaller } from './create-alias';
import { assertMayMint, assertTargetAcceptable, loadSpace, mintAlias } from './mint-alias';
import { appBaseUrl, shortUrl } from './tenant-domains';

const REGION = 'europe-west6';

export interface ResolveAliasRequest {
  tenantId?: string;
  space?: string;
  original?: string;
  targetType?: AliasTargetType;
  targetUrl?: string;
  targetKey?: string;
  notes?: string;
}

export interface ResolveAliasResponse {
  alias: string;
  url: string;
  /** false, wenn ein bestehender Alias wiederverwendet wurde — das ist der Normalfall. */
  created: boolean;
}

/**
 * Den bestehenden Alias für `(space, original)` suchen.
 *
 * Nutzt den Reverse-Lookup-Index aus Teilprojekt 1 (`tenants` + `isArchived` + `space` +
 * `original`). Ein widerrufener oder archivierter Alias zählt NICHT als Treffer: er ist keine
 * gültige Identität des Ziels mehr, und ein neuer muss geprägt werden.
 */
export async function findExistingAlias(
  db: Firestore,
  tenantId: string,
  space: string,
  original: string,
): Promise<AliasModel | undefined> {
  const snap = await db.collection(AliasCollection)
    .where('tenants', 'array-contains', tenantId)
    .where('isArchived', '==', false)
    .where('space', '==', space)
    .where('original', '==', original)
    .limit(1)
    .get();
  if (snap.empty) return undefined;
  const alias = { okey: snap.docs[0].id, ...snap.docs[0].data() } as AliasModel;
  return alias.isEnabled ? alias : undefined;
}

/**
 * `resolveAlias` — idempotent: sucht den bestehenden Alias und prägt nur, wenn keiner da ist.
 *
 * Für Identitäten: derselbe Trip, dasselbe geteilte Dokument, egal wie oft verlinkt. Die
 * Abgrenzung zu `createAlias` ist die eigentliche Entscheidung der Spec (Entscheid 4): **Ist
 * der Alias die Identität des Ziels oder ein Messpunkt auf dem Weg dorthin?** Beide Fälle
 * kommen real vor, deshalb entscheidet der Aufrufer per Operation und nicht per Flag.
 */
export const resolveAlias = onCall<ResolveAliasRequest, Promise<ResolveAliasResponse>>(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    checkAppCheckToken(request, 'resolveAlias');
    checkAuthentication(request, 'resolveAlias');

    const tenantId = request.data?.tenantId?.trim();
    const spaceName = request.data?.space?.trim();
    const original = request.data?.original?.trim();
    if (!tenantId) throw new HttpsError('invalid-argument', 'resolveAlias requires a tenantId.');
    if (!spaceName) throw new HttpsError('invalid-argument', 'resolveAlias requires a space.');
    if (!original) throw new HttpsError('invalid-argument', 'resolveAlias requires an original.');

    const db = getFirestore();
    const { roles, personKey } = await resolveCaller(request.auth?.uid ?? '', tenantId);
    const space = await loadSpace(db, tenantId, spaceName);
    const baseUrl = await appBaseUrl(tenantId);

    const existing = await findExistingAlias(db, tenantId, space.name, original);
    if (existing) {
      return { alias: existing.alias, url: shortUrl(baseUrl, space.name, existing.alias), created: false };
    }

    // Erst jetzt wird geschrieben — also erst jetzt die Schreibrechte prüfen. Wer nur lesen
    // darf, soll einen bestehenden Alias trotzdem auflösen können.
    assertMayMint(space, roles);

    const targetType = request.data?.targetType ?? 'url';
    const targetUrl = request.data?.targetUrl ?? original;
    const targetKey = request.data?.targetKey ?? '';
    assertTargetAcceptable(space, targetType, targetUrl, targetKey);

    const minted = await mintAlias(db, {
      tenantId,
      space,
      targetType,
      targetUrl,
      targetKey,
      original,
      notes: request.data?.notes ?? '',
      createdBy: personKey ? `person.${personKey}` : '',
      now: getTodayStr(DateFormat.StoreDateTime),
    });

    logger.info(`resolveAlias: minted ${tenantId}/${spaceName}/${minted.alias}`);
    return { alias: minted.alias, url: shortUrl(baseUrl, space.name, minted.alias), created: true };
  },
);

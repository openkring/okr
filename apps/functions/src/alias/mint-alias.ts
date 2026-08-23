import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

import {
  AliasCollection,
  AliasModel,
  AliasSpaceCollection,
} from '@okr/shared-models';
import type { AliasSpaceModel, AliasTargetType } from '@okr/shared-models';
import { removeKeyFromOkrModel } from '@okr/shared-util-core';
import {
  buildAliasDocId,
  generateAliasCode,
  isRoutableTargetKey,
  isSafeTargetUrl,
  isValidAliasFormat,
} from '@okr/system-alias-util';

import type { MintParams, MintedAlias } from './types';

const MAX_COLLISION_RETRIES = 5;

/**
 * gRPC ALREADY_EXISTS. Das ist der ganze Grund, warum hier `.create()` steht und nicht `.set()`:
 * `setDoc()` würde einen bestehenden — womöglich gedruckten — Alias still überschreiben, statt
 * zu kollidieren. Die deterministische Document-ID allein erzwingt keine Eindeutigkeit.
 */
const ALREADY_EXISTS = 6;

const isAlreadyExists = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === ALREADY_EXISTS;

/** Den Space über seinen `name` laden — der Name steht in der URL und in der Document-ID. */
export async function loadSpace(
  db: Firestore,
  tenantId: string,
  spaceName: string,
): Promise<AliasSpaceModel> {
  const snap = await db.collection(AliasSpaceCollection)
    .where('tenants', 'array-contains', tenantId)
    .where('isArchived', '==', false)
    .where('name', '==', spaceName)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new HttpsError('not-found', `Unknown alias space '${spaceName}'.`);
  }
  const space = { okey: snap.docs[0].id, ...snap.docs[0].data() } as AliasSpaceModel;
  if (!space.isEnabled) {
    throw new HttpsError('failed-precondition', `Alias space '${spaceName}' is disabled.`);
  }
  return space;
}

/** Der Space bestimmt per `roleNeeded`, wer darin prägen darf (Spec, Entscheid 9). */
export function assertMayMint(space: AliasSpaceModel, roles: Record<string, boolean>): void {
  // admin ist überall einschlussfähig, sonst müsste jeder Space ihn einzeln nennen.
  if (roles['admin'] === true) return;
  if (roles[space.roleNeeded] !== true) {
    throw new HttpsError('permission-denied',
      `Minting in space '${space.name}' requires the '${space.roleNeeded}' role.`);
  }
}

/**
 * Darf dieser Space dieses Ziel überhaupt aufnehmen?
 *
 * Der `model`-Zweig ist der TP1-Review-Befund als SCHREIB-Gate: ein Modellziel ohne
 * Detailroute wird gar nicht erst geprägt. Sonst entstünde ein gültiger, druckbarer Code,
 * der im Resolver nur noch 404 sein kann — und unter der früheren
 * `/{modelType}/{okey}`-Annahme sogar ein 302 auf eine FALSCHE Seite.
 */
export function assertTargetAcceptable(
  space: AliasSpaceModel,
  targetType: AliasTargetType,
  targetUrl: string,
  targetKey: string,
): void {
  if (!space.targetTypes.includes(targetType)) {
    throw new HttpsError('invalid-argument',
      `Space '${space.name}' does not accept targetType '${targetType}'.`);
  }
  if (targetType === 'url' && !isSafeTargetUrl(targetUrl)) {
    throw new HttpsError('invalid-argument',
      'targetUrl must be an https: url — open-redirect protection.');
  }
  // Only a REDIRECT space needs a detail route: it answers with a 302 and has nowhere else to
  // point. A lookup space hands targetKey to the app, which renders the record itself — the
  // 'diary person' case, where 'location' legitimately has no detail page. Widening
  // ALIAS_TARGET_ROUTES instead would let a redirect space mint a code that 302s into an
  // empty list, which is the defect that map exists to prevent.
  if (targetType === 'model' && space.kind === 'redirect' && !isRoutableTargetKey(targetKey)) {
    throw new HttpsError('invalid-argument',
      `targetKey '${targetKey}' has no detail route in this app (see ALIAS_TARGET_ROUTES) — `
      + 'a printed code for it could never resolve.');
  }
}

/** Das Dokument aus den Parametern bauen; die Space-Defaults greifen, wo nichts gesetzt ist. */
function buildAlias(params: MintParams, code: string): AliasModel {
  const { space } = params;
  const alias = new AliasModel(params.tenantId);
  alias.space = space.name;
  alias.alias = code;
  alias.targetType = params.targetType;
  alias.targetUrl = params.targetUrl;
  alias.targetKey = params.targetKey;
  alias.original = params.original;
  alias.notes = params.notes;
  alias.validUntil = params.validUntil ?? '';
  alias.maxUses = params.maxUses ?? space.defaultMaxUses;
  alias.trackingLevel = params.trackingLevel ?? 'inherit';
  alias.createdBy = params.createdBy;
  alias.createdAt = params.now;

  // okey wird vor dem Schreiben abgestreift und beim Lesen wieder angehängt (Repo-Konvention);
  // `removeKeyFromOkrModel` ist derselbe Helfer, den FirestoreService.createModel benutzt.
  return removeKeyFromOkrModel(alias);
}

/**
 * Einen Alias prägen — kollisionssicher.
 *
 * Ein Vanity-Handle wird BEWUSST nicht wiederholt: bei Kollision ist „schon vergeben" die
 * richtige Antwort an den Aufrufer, nicht ein anderer Code. Nur generierte Codes werden neu
 * gewürfelt.
 */
export async function mintAlias(db: Firestore, params: MintParams): Promise<MintedAlias> {
  const { tenantId, space } = params;

  if (params.requestedAlias) {
    if (!space.allowCustom) {
      throw new HttpsError('invalid-argument',
        `Space '${space.name}' has allowCustom: false — no vanity handles.`);
    }
    if (!isValidAliasFormat(params.requestedAlias, space)) {
      throw new HttpsError('invalid-argument',
        `'${params.requestedAlias}' is not a valid alias for space '${space.name}'.`);
    }
    const docId = buildAliasDocId(tenantId, space.name, params.requestedAlias, space.caseSensitive);
    try {
      await db.collection(AliasCollection).doc(docId).create(buildAlias(params, params.requestedAlias));
    } catch (err) {
      if (isAlreadyExists(err)) {
        throw new HttpsError('already-exists', `Alias '${params.requestedAlias}' is already taken.`);
      }
      throw err;
    }
    return { alias: params.requestedAlias, docId };
  }

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const code = generateAliasCode(space.charset, space.length);
    const docId = buildAliasDocId(tenantId, space.name, code, space.caseSensitive);
    try {
      await db.collection(AliasCollection).doc(docId).create(buildAlias(params, code));
      return { alias: code, docId };
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
    }
  }
  throw new HttpsError('resource-exhausted',
    `Alias collision ${MAX_COLLISION_RETRIES}x in space '${space.name}' — increase its length.`);
}

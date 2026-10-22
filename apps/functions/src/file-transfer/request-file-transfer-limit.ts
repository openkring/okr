import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';

import { AppConfig, AppConfigCollection, UserModel } from '@okr/shared-models';
import { isKioskOnly } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { resolveFileTransferLimits } from '@okr/content-file-transfer-util';

import { matrixAdminToken, resolveGroupRoom, resolvePersonDisplayName, serverHostname } from '../matrix-simple/shared';
import { checkRateLimit } from '../publicApi/rateLimit';
import { matrixBotToken, postGroupChatMessage } from '../workflow/matrix-bot';
import { logFileTransferEvent } from './file-transfer-access';

const CF_NAME = 'requestFileTransferLimit';
const MAX_REASON = 500;
const GB = 1024 ** 3;
/** 3 requests per person per 24 h (bucket `transferLimitReq`, key = personKey). */
export const LIMIT_REQUEST_LIMIT = { limit: 3, windowMs: 24 * 60 * 60 * 1000 };

const gb = (bytes: number): string => `${Math.round((bytes / GB) * 10) / 10} GB`;

/** German, neutral wording for the support room (read by admins). */
export function limitRequestMessage(senderName: string, limits: { maxFileTransferBytes: number; maxOpenBytes: number }, reason: string): string {
  return `Anfrage für höhere Übertragungslimiten (Dateiübertragung) von ${senderName}.\n`
    + `Aktuell: ${gb(limits.maxFileTransferBytes)} pro Übertragung, ${gb(limits.maxOpenBytes)} insgesamt offen.\n`
    + `Begründung: ${reason}`;
}

/**
 * callable 'requestFileTransferLimit' {reason} → {} (spec 1.115 §4.4). A registered member asks for
 * higher limits; the request is posted to the tenant's support room for the admins to act on
 * (overrides live in app-config). 3 per person per 24 h; event 'limitRequested'.
 */
export const requestFileTransferLimit = onCall<unknown, Promise<Record<string, never>>>(
  { region: 'europe-west6', enforceAppCheck: true, cors: true, secrets: [matrixAdminToken, matrixBotToken] },
  async (request) => {
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);
    const tenantId = await getCallerTenantId(request, CF_NAME);
    const raw = (request.data as { reason?: unknown } | null)?.reason;
    const reason = typeof raw === 'string' ? raw.trim() : '';
    if (reason.length < 1 || reason.length > MAX_REASON) throw new HttpsError('invalid-argument', 'reason');

    const db = getFirestore();
    const user = (await db.collection('users').doc(request.auth?.uid ?? '').get()).data() as Partial<UserModel> | undefined;
    const personKey = user?.personKey;
    if (!personKey) throw new HttpsError('failed-precondition', 'User profile has no linked person.');
    if (user.roles?.registered !== true || isKioskOnly(user as UserModel)) throw new HttpsError('permission-denied', 'Registered users only.');

    const roomId = await resolveGroupRoom(`${tenantId}_support`, serverHostname(), matrixAdminToken.value());
    if (!roomId) throw new HttpsError('failed-precondition', 'noSupportRoom');

    const rl = await checkRateLimit('transferLimitReq', personKey, LIMIT_REQUEST_LIMIT);
    if (!rl.allowed) throw new HttpsError('resource-exhausted', 'tooManyRequests');

    const config = (await db.collection(AppConfigCollection).doc(tenantId).get()).data() as Partial<AppConfig> | undefined;
    const limits = resolveFileTransferLimits(config?.fileTransferLimits, personKey);
    const name = (await resolvePersonDisplayName(personKey)) ?? personKey;
    await postGroupChatMessage(roomId, limitRequestMessage(name, limits, reason), `ftlimit-${randomUUID()}`, matrixAdminToken.value());

    await logFileTransferEvent(db, {
      tenants: [tenantId], transferKey: '', senderKey: personKey, type: 'limitRequested',
      recipientId: '', actorKey: personKey, fileIndex: -1, at: new Date().toISOString(),
    });
    return {};
  },
);

// apps/functions/src/contract/contract-request-status.ts
//
// What the member sees under a request button (spec 1.88 §5.3). Derived on every call from the
// same documents the eligibility reads, so the status and a refusal can never disagree.
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { ContractRequestState } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { MATRIX_HOMESERVER, matrixAdminToken, resolveChatRoomForPerson } from '../matrix-simple/shared';
import { translateMessage } from '../workflow/firestore-deps';
import { loadRequestContext } from './contract-request.loader';
import { deriveRequestState, newestOpenApproval, requestStatusParams } from './contract-request.util';

const REGION = 'europe-west6';
const CF_NAME = 'getContractRequestStatus';

export interface RequestStatusData { tenantId: string; sectionKey: string; }
export interface RequestStatusResult { state: ContractRequestState; text: string; roomId?: string; }

export const getContractRequestStatus = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, secrets: [matrixAdminToken] },
  async (request: CallableRequest<RequestStatusData>): Promise<RequestStatusResult> => {
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    const { tenantId, sectionKey } = request.data ?? ({} as RequestStatusData);
    if (!tenantId || !sectionKey) throw new HttpsError('invalid-argument', 'tenantId and sectionKey are required');

    const db = getFirestore();
    const ctx = await loadRequestContext(db, request.auth!.uid, tenantId, sectionKey, CF_NAME);
    const input = { ...ctx.eligibility, statusApprovals: ctx.statusApprovals };
    const state = deriveRequestState(input);
    const messages = (ctx.kindDoc['statusMessages'] as Record<string, string> | undefined) ?? {};
    const messageKey = messages[state] ?? '';
    if (!messageKey) return { state, text: '' };

    const askGroupKey = String(ctx.kindDoc['askGroupKey'] ?? '');
    const group = askGroupKey ? (await db.collection('groups').doc(askGroupKey).get()).data() : undefined;
    const firstAdmin = ((group?.['admins'] ?? []) as Array<{ name1?: string; name2?: string }>)[0];
    const fallback = `${firstAdmin?.name1 ?? ''} ${firstAdmin?.name2 ?? ''}`.trim() || String(group?.['name'] ?? '');
    const params = requestStatusParams(
      newestOpenApproval(ctx.statusApprovals, input), String(ctx.kindDoc['name'] ?? ctx.kind), fallback,
    );
    // {link} is the client's: keep the placeholder standing in the rendered text
    const text = await translateMessage(tenantId, messageKey, { ...params, link: '{link}' });

    let roomId: string | undefined;
    if ((state === 'pending' || state === 'approved') && askGroupKey) {
      try {
        const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
        roomId = await resolveChatRoomForPerson(askGroupKey, ctx.personKey, hostname, matrixAdminToken.value(), { create: false });
      } catch (error) {
        // a missing link must never cost the member the status line
        logger.warn(`${CF_NAME}: no room for ${ctx.personKey} in ${askGroupKey}`, { error: String(error) });
      }
    }
    return roomId ? { state, text, roomId } : { state, text };
  },
);

//
// «Antrag stellen» (spec 1.87 §6.2). Checks eligibility synchronously — a member must hear
// "not possible" at once, not in a chat later — then emits 'contract.requested'; the rest is rules.
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';
import { emitEvent } from '../workflow/emit';
import { claimCooldown } from '../workflow/ui-event';
import { EligibilityRefusal, checkContractEligibility } from './contract-request.util';
import { loadRequestContext, verifyContractSource } from './contract-request.loader';

const REGION = 'europe-west6';
const CF_NAME = 'requestContract';

export interface RequestContractData { tenantId: string; sectionKey: string; confirm: boolean; }
export type RequestContractResult =
  | { preview: { name: string; street: string; zipCity: string; date: string; kindName: string } }
  | { requested: true }
  | { refused: EligibilityRefusal | 'cooldown' };

export { verifyContractSource };

export const requestContract = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<RequestContractData>): Promise<RequestContractResult> => {
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    const uid = request.auth!.uid;
    const { tenantId, sectionKey, confirm } = request.data ?? ({} as RequestContractData);
    if (!tenantId || !sectionKey) throw new HttpsError('invalid-argument', 'tenantId and sectionKey are required');

    const db = getFirestore();
    const ctx = await loadRequestContext(db, uid, tenantId, sectionKey, CF_NAME);
    const refusal = checkContractEligibility(ctx.eligibility);
    if (refusal) return { refused: refusal };

    const { personKey, kind, kindDoc, today } = ctx;
    const p = ctx.person;
    const name = `${p['firstName'] ?? ''} ${p['lastName'] ?? ''}`.trim();
    const kindName = String(kindDoc['name'] ?? kind);
    const postalAddress = ctx.eligibility.postalAddress;
    const requiresAddress = ctx.eligibility.requiresAddress !== false;
    // spec 1.88 §5.5: a kind without an address has nothing to confirm — the first call submits
    if (requiresAddress && !confirm) {
      return { preview: { name, street: postalAddress!.street, zipCity: postalAddress!.zipCity,
        date: convertDateFormatToString(today, DateFormat.StoreDate, DateFormat.ViewDate), kindName } };
    }

    if (!(await claimCooldown(db, uid, sectionKey, Date.now()))) return { refused: 'cooldown' };
    await emitEvent('contract.requested', tenantId, `person.${personKey}`, {
      personKey, subjectName: `${name} — ${kindName}`, params: { kind },
    });
    logger.info(`${CF_NAME}: ${kind} requested by ${personKey} (tenant ${tenantId})`);
    return { requested: true };
  },
);

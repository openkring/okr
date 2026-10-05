//
// «Antrag stellen» (spec 1.87 §6.2). Checks eligibility synchronously — a member must hear
// "not possible" at once, not in a chat later — then emits 'contract.requested'; the rest is rules.
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  ApprovalCollection, ButtonAction, ContractCollection, ContractKindCollection, EsignCollection, SectionCollection,
} from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { DateFormat, convertDateFormatToString, getTodayStr } from '@okr/shared-util-core';
import { emitEvent } from '../workflow/emit';
import { claimCooldown } from '../workflow/ui-event';
import { DocData, EligibilityRefusal, checkContractEligibility, formatPostalAddress } from './contract-request.util';

const REGION = 'europe-west6';
const CF_NAME = 'requestContract';

export interface RequestContractData { tenantId: string; sectionKey: string; confirm: boolean; }
export type RequestContractResult =
  | { preview: { name: string; street: string; zipCity: string; date: string; kindName: string } }
  | { requested: true }
  | { refused: EligibilityRefusal | 'cooldown' };

/** The kind comes from the SECTION document, never from the request (same rule as verifyButtonSource). */
export function verifyContractSource(doc: DocData | undefined, tenantId: string): string | undefined {
  if (!doc || doc['isArchived'] === true || doc['type'] !== 'button') return undefined;
  if (!((doc['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return undefined;
  const action = ((doc['properties'] as DocData | undefined)?.['action'] ?? {}) as DocData;
  if (action['type'] !== ButtonAction.Contract) return undefined;
  const kind = String(action['url'] ?? '').trim();
  return kind || undefined;
}

export const requestContract = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<RequestContractData>): Promise<RequestContractResult> => {
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    const uid = request.auth!.uid;
    const { tenantId, sectionKey, confirm } = request.data ?? ({} as RequestContractData);
    if (!tenantId || !sectionKey) throw new HttpsError('invalid-argument', 'tenantId and sectionKey are required');

    const db = getFirestore();
    const user = (await db.collection('users').doc(uid).get()).data();
    if (!user || !((user['tenants'] as string[]) ?? []).includes(tenantId)) {
      throw new HttpsError('permission-denied', 'not a member of this tenant');
    }
    const personKey = String(user['personKey'] ?? '');
    if (!personKey) throw new HttpsError('failed-precondition', 'user has no person');

    const kind = verifyContractSource((await db.collection(SectionCollection).doc(sectionKey).get()).data(), tenantId);
    if (!kind) throw new HttpsError('permission-denied', 'not a contract button');
    const kindDoc = (await db.collection(ContractKindCollection).doc(kind).get()).data();
    if (!kindDoc || kindDoc['isArchived'] === true || !((kindDoc['tenants'] as string[]) ?? []).includes(tenantId)) {
      throw new HttpsError('failed-precondition', `contract kind '${kind}' is not configured`);
    }

    const today = getTodayStr(DateFormat.StoreDate);
    const [person, memberships, approvals, contracts, addresses] = await Promise.all([
      db.collection('persons').doc(personKey).get(),
      db.collection('memberships').where('memberKey', '==', personKey).get(),
      db.collection(ApprovalCollection).where('subjectKey', '==', `person.${personKey}`).get(),
      db.collection(ContractCollection).where('partyPersonKeys', 'array-contains', personKey).get(),
      db.collection('addresses').where('parentKey', '==', `person.${personKey}`).get(),
    ]);
    const inTenant = (d: DocData) => ((d['tenants'] as string[]) ?? []).includes(tenantId);
    const postal = addresses.docs.map((d) => d.data())
      .filter((a) => !a['isArchived'] && a['addressChannel'] === 'postal' && inTenant(a));
    const postalAddress = formatPostalAddress(postal.find((a) => a['isFavorite'] === true) ?? postal[0]);

    const ownApprovals = approvals.docs.map((d) => ({ ...d.data(), okey: d.id } as DocData)).filter(inTenant);
    const ownContracts = contracts.docs.map((d) => d.data()).filter(inTenant);
    // Only approved, unfiled approvals of this kind need their signature runs: a run that ended
    // rejected/withdrawn/error must not block a new request forever.
    const filed = new Set(ownContracts.map((c) => String(c['sourceRef'] ?? '')));
    const awaitingSignature = ownApprovals
      .filter((a) => a['isArchived'] !== true && a['kind'] === kind && a['state'] === 'approved')
      .map((a) => `approval.${a['okey']}`)
      .filter((ref) => !filed.has(ref));
    const runSnaps = await Promise.all(awaitingSignature.map((ref) =>
      db.collection(EsignCollection).where('sourceRef', '==', ref).get()));
    // esign records carry a singular tenantId, not tenants[]
    const esignRuns = runSnaps.flatMap((s) => s.docs.map((d) => d.data()))
      .filter((r) => r['tenantId'] === tenantId);

    const refusal = checkContractEligibility({
      eligibility: (kindDoc['eligibility'] as string[]) ?? [],
      orgKey: String(kindDoc['orgKey'] ?? ''), kind, today,
      memberships: memberships.docs.map((d) => d.data()).filter(inTenant),
      approvals: ownApprovals,
      contracts: ownContracts,
      esignRuns,
      postalAddress,
    });
    if (refusal) return { refused: refusal };

    const p = person.data() ?? {};
    const name = `${p['firstName'] ?? ''} ${p['lastName'] ?? ''}`.trim();
    const kindName = String(kindDoc['name'] ?? kind);
    if (!confirm) {
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

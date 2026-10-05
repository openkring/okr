//
// Shared loader for the contract request callables (spec 1.87 §6.2, spec 1.88): everything that
// is read and verified before an eligibility decision, so «Antrag stellen» and the status
// callable decide on exactly the same data.
import { HttpsError } from 'firebase-functions/v2/https';
import { Firestore } from 'firebase-admin/firestore';
import {
  ApprovalCollection, ButtonAction, ContractCollection, ContractKindCollection, EsignCollection, SectionCollection,
} from '@okr/shared-models';
import { DateFormat, convertDateFormatToString, getTodayStr } from '@okr/shared-util-core';
import { DocData, EligibilityInput, StatusApproval, formatPostalAddress } from './contract-request.util';

export interface RequestContext {
  tenantId: string; uid: string; personKey: string; sectionKey: string;
  kind: string; kindDoc: DocData; today: string;
  person: DocData;
  eligibility: EligibilityInput;          // fully populated, incl. ownerships / resourceType / requiresAddress / hasSigners
  statusApprovals: StatusApproval[];      // the person's approvals with requestDate/createTime
}

/** The kind comes from the SECTION document, never from the request (same rule as verifyButtonSource). */
export function verifyContractSource(doc: DocData | undefined, tenantId: string): string | undefined {
  if (!doc || doc['isArchived'] === true || doc['type'] !== 'button') return undefined;
  if (!((doc['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return undefined;
  const action = ((doc['properties'] as DocData | undefined)?.['action'] ?? {}) as DocData;
  if (action['type'] !== ButtonAction.Contract) return undefined;
  const kind = String(action['url'] ?? '').trim();
  return kind || undefined;
}

export async function loadRequestContext(
  db: Firestore, uid: string, tenantId: string, sectionKey: string, cfName: string,
): Promise<RequestContext> {
  const user = (await db.collection('users').doc(uid).get()).data();
  if (!user || !((user['tenants'] as string[]) ?? []).includes(tenantId)) {
    throw new HttpsError('permission-denied', `${cfName}: not a member of this tenant`);
  }
  const personKey = String(user['personKey'] ?? '');
  if (!personKey) throw new HttpsError('failed-precondition', `${cfName}: user has no person`);

  const kind = verifyContractSource((await db.collection(SectionCollection).doc(sectionKey).get()).data(), tenantId);
  if (!kind) throw new HttpsError('permission-denied', `${cfName}: not a contract button`);
  const kindDoc = (await db.collection(ContractKindCollection).doc(kind).get()).data();
  if (!kindDoc || kindDoc['isArchived'] === true || !((kindDoc['tenants'] as string[]) ?? []).includes(tenantId)) {
    throw new HttpsError('failed-precondition', `${cfName}: contract kind '${kind}' is not configured`);
  }

  const resourceType = String(kindDoc['resourceType'] ?? '');
  const requiresAddress = kindDoc['requiresAddress'] !== false;
  const hasSigners = ((kindDoc['signers'] as unknown[]) ?? []).length > 0;
  const eligibilityList = (kindDoc['eligibility'] as string[]) ?? [];

  const today = getTodayStr(DateFormat.StoreDate);
  const [person, memberships, approvals, contracts, addresses] = await Promise.all([
    db.collection('persons').doc(personKey).get(),
    db.collection('memberships').where('memberKey', '==', personKey).get(),
    db.collection(ApprovalCollection).where('subjectKey', '==', `person.${personKey}`).get(),
    db.collection(ContractCollection).where('partyPersonKeys', 'array-contains', personKey).get(),
    requiresAddress
      ? db.collection('addresses').where('parentKey', '==', `person.${personKey}`).get()
      : Promise.resolve(undefined),
  ]);
  const inTenant = (d: DocData) => ((d['tenants'] as string[]) ?? []).includes(tenantId);
  const postal = (addresses?.docs ?? []).map((d) => d.data())
    .filter((a) => !a['isArchived'] && a['addressChannel'] === 'postal' && inTenant(a));
  const postalAddress = requiresAddress
    ? formatPostalAddress(postal.find((a) => a['isFavorite'] === true) ?? postal[0])
    : undefined;

  const ownerships = eligibilityList.includes('noActiveOwnership') && resourceType
    ? (await db.collection('ownerships').where('ownerKey', '==', personKey).get()).docs
        .map((d) => d.data())
        .filter((o) => o['ownerModelType'] === 'person' && inTenant(o))
    : [];

  // Each approval carries the day it was requested: the stored requestDate, else (legacy) the
  // snapshot's create time — the same value in the eligibility DocData and the StatusApproval.
  const tenantApprovals = approvals.docs.filter((d) => inTenant(d.data()));
  const ownApprovals: DocData[] = [];
  const statusApprovals: StatusApproval[] = [];
  for (const d of tenantApprovals) {
    const a = d.data();
    const created = d.createTime?.toDate();
    const createTime = created
      ? convertDateFormatToString(created.toISOString().slice(0, 19), DateFormat.IsoDateTime, DateFormat.StoreDateTime, false)
      : '';
    const storedRequestDate = String(a['requestDate'] ?? '');
    ownApprovals.push({ ...a, okey: d.id, requestDate: storedRequestDate || createTime });
    statusApprovals.push({
      okey: d.id, state: String(a['state'] ?? 'pending'), kind: String(a['kind'] ?? ''),
      isArchived: a['isArchived'] === true, requestDate: storedRequestDate, createTime,
      approver: a['approver'] as StatusApproval['approver'],
    });
  }

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

  const eligibility: EligibilityInput = {
    eligibility: eligibilityList,
    orgKey: String(kindDoc['orgKey'] ?? ''), kind, today,
    memberships: memberships.docs.map((d) => d.data()).filter(inTenant),
    approvals: ownApprovals,
    contracts: ownContracts,
    esignRuns,
    postalAddress,
    ownerships, resourceType, requiresAddress, hasSigners,
  };
  return { tenantId, uid, personKey, sectionKey, kind, kindDoc, today, person: person.data() ?? {}, eligibility, statusApprovals };
}

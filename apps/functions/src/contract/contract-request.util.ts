// apps/functions/src/contract/contract-request.util.ts
//
// Pure helpers of the contract request flow (spec 1.87 §6.2, §6.4). No Firestore here: the
// callable and the workflow deps load the documents, these functions decide.
import { ContractRequestState, ContractSigner } from '@okr/shared-models';
import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';

export type DocData = Record<string, unknown>;
export type EligibilityRefusal = 'notActive' | 'alreadyOwned' | 'openRequest' | 'noAddress';

export interface PostalAddress { street: string; zipCity: string; }
export interface ResolvedSigner { name: string; email: string; }
export interface SignatureBlock { pattern: string; name: string; label: string; signOrder: number; }

export interface EligibilityInput {
  eligibility: string[];
  orgKey: string;
  kind: string;
  today: string;                 // StoreDate
  memberships: DocData[];        // the person's memberships (any org)
  approvals: DocData[];          // approvals whose subjectKey is 'person.<key>', each with its `okey`
  contracts: DocData[];          // contracts listing the person in partyPersonKeys
  esignRuns: DocData[];          // esignList records of the approved approvals (`sourceRef`, `documentStatus`)
  postalAddress: PostalAddress | undefined;
  ownerships?: DocData[];        // the person's ownerships (spec 1.88), loaded only for 'noActiveOwnership'
  resourceType?: string;         // the kind's resource type, '' = none
  requiresAddress?: boolean;     // undefined = true (legacy kind documents)
  hasSigners?: boolean;          // undefined = true (legacy kind documents)
}

/** Terminal esign states that will never produce a signed PDF. */
const DEAD_RUN = ['rejected', 'withdrawn', 'error'];

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim();

/**
 * Active = an unarchived membership of the org in category 'active' whose date range contains today.
 * `state` is NOT trusted: live data carries exited memberships with state 'active'.
 */
export function isActiveMembership(m: DocData, orgKey: string, today: string): boolean {
  if (m['isArchived'] === true) return false;
  if (str(m['orgKey']) !== orgKey || str(m['category']) !== 'active') return false;
  const from = str(m['dateOfEntry']);
  const to = str(m['dateOfExit']);
  if (from && today < from) return false;
  if (to && today > to) return false;
  return true;
}

/**
 * Active = an unarchived ownership of the resource type whose validity window contains today
 * (spec 1.88 D3). `state` is NOT trusted, for the same reason as in isActiveMembership.
 */
export function isActiveOwnership(o: DocData, resourceType: string, today: string): boolean {
  if (o['isArchived'] === true) return false;
  if (!resourceType || str(o['resourceType']) !== resourceType) return false;
  const from = str(o['validFrom']);
  const to = str(o['validTo']);
  if (from && today < from) return false;
  if (to && today > to) return false;
  return true;
}

function ownsResource(input: EligibilityInput): boolean {
  const type = input.resourceType ?? '';
  return (input.ownerships ?? []).some((o) => isActiveOwnership(o, type, input.today));
}

/**
 * An approved request of a signer-less kind is consumed once an unarchived ownership of the
 * resource type exists whose validity has not ended before the request day (validTo empty or on/after
 * it). validFrom does not matter, so a backdated handover consumes it too. Without a request day it
 * can only be proven consumed by an active ownership.
 */
export function isConsumedApproval(a: DocData, ownerships: DocData[], resourceType: string, today: string): boolean {
  const day = str(a['requestDate']).slice(0, 8);
  if (!day) return ownerships.some((o) => isActiveOwnership(o, resourceType, today));
  return ownerships.some((o) => {
    if (o['isArchived'] === true || !resourceType || str(o['resourceType']) !== resourceType) return false;
    const to = str(o['validTo']).slice(0, 8);
    return to === '' || to >= day;
  });
}

function hasOpenRequest(input: EligibilityInput): boolean {
  const tag = `contract:${input.kind}`;
  const contractOpen = input.contracts.some((c) =>
    c['isArchived'] !== true && str(c['tags']).split(',').map((t) => t.trim()).includes(tag) && str(c['state']) !== 'ended');
  if (contractOpen) return true;
  // pending = waiting for the committee; approved WITHOUT a filed contract = signing in progress
  // (the contract only exists once signed). An approved request whose contract exists is decided
  // by that contract's state above. Signing is in progress while there is no run yet (being set
  // up) or at least one run is still alive; when every run ended rejected/withdrawn/error the
  // request is dead and must not block a new one forever.
  const filed = new Set(input.contracts.map((c) => str(c['sourceRef'])));
  const signingAlive = (sourceRef: string): boolean => {
    const runs = input.esignRuns.filter((r) => str(r['sourceRef']) === sourceRef);
    return runs.length === 0 || runs.some((r) => !DEAD_RUN.includes(str(r['documentStatus'])));
  };
  return input.approvals.some((a) => {
    if (a['isArchived'] === true || str(a['kind']) !== input.kind) return false;
    const state = str(a['state']);
    if (state === 'pending') return true;
    const sourceRef = `approval.${str(a['okey'])}`;
    if (state !== 'approved') return false;
    // spec 1.88 D5: a kind without signers has no contract to wait for — an approved request
    // stays open until the handover is recorded as an ownership
    if (input.hasSigners === false) return !isConsumedApproval(a, input.ownerships ?? [], input.resourceType ?? '', input.today);
    return !filed.has(sourceRef) && signingAlive(sourceRef);
  });
}

/** The first refusal, or undefined when the person may apply. */
export function checkContractEligibility(input: EligibilityInput): EligibilityRefusal | undefined {
  if (input.eligibility.includes('activeMember') &&
      !input.memberships.some((m) => isActiveMembership(m, input.orgKey, input.today))) return 'notActive';
  if (input.eligibility.includes('noActiveOwnership') && ownsResource(input)) return 'alreadyOwned';
  if (input.eligibility.includes('noOpenRequest') && hasOpenRequest(input)) return 'openRequest';
  if (input.requiresAddress !== false && !input.postalAddress) return 'noAddress';
  return undefined;
}

/** An approval as the status needs it; `createTime` is the snapshot's create time as StoreDateTime. */
export interface StatusApproval {
  okey: string;
  state: string;
  kind: string;
  isArchived?: boolean;
  requestDate: string;           // '' on approvals created before spec 1.88
  createTime: string;
  approver?: { name1?: string; name2?: string };
}

const requestedAt = (a: StatusApproval): string => a.requestDate || a.createTime;

/** The most recently requested, unarchived approval of the kind. */
export function newestApproval(approvals: StatusApproval[], kind: string): StatusApproval | undefined {
  return approvals
    .filter((a) => a.isArchived !== true && a.kind === kind)
    .sort((x, y) => requestedAt(y).localeCompare(requestedAt(x)))[0];
}

/** The most recently requested OPEN approval: pending, or approved and not yet consumed by an ownership. */
export function newestOpenApproval(approvals: StatusApproval[], input: EligibilityInput): StatusApproval | undefined {
  return approvals
    .filter((a) => a.isArchived !== true && a.kind === input.kind)
    .filter((a) => a.state === 'pending' || (a.state === 'approved' &&
      !isConsumedApproval({ requestDate: requestedAt(a) }, input.ownerships ?? [], input.resourceType ?? '', input.today)))
    .sort((x, y) => requestedAt(y).localeCompare(requestedAt(x)))[0];
}

/** spec 1.88 §5.3 — first match wins; for kinds without signers it agrees with the eligibility (signer kinds carry no statusMessages, so their status is never shown). */
export function deriveRequestState(input: EligibilityInput & { statusApprovals: StatusApproval[] }): ContractRequestState {
  if (checkContractEligibility({ ...input, eligibility: input.eligibility.filter((e) => e === 'activeMember') }) === 'notActive') {
    return 'notActive';
  }
  if (input.resourceType && ownsResource(input)) return 'owned';
  const newest = newestOpenApproval(input.statusApprovals, input);
  if (newest?.state === 'pending') return 'pending';
  if (newest?.state === 'approved') return 'approved';
  return 'none';
}

/** `{date}`, `{responsible}`, `{kind}` for the status texts. `{link}` is filled on the client. */
export function requestStatusParams(
  a: StatusApproval | undefined, kindName: string, fallbackResponsible: string,
): Record<string, string> {
  const at = a ? requestedAt(a).slice(0, 8) : '';
  const approver = `${a?.approver?.name1 ?? ''} ${a?.approver?.name2 ?? ''}`.trim();
  return {
    date: at ? convertDateFormatToString(at, DateFormat.StoreDate, DateFormat.ViewDate) : '',
    responsible: approver || fallbackResponsible,
    kind: kindName,
  };
}

export function formatPostalAddress(a: DocData | undefined): PostalAddress | undefined {
  if (!a) return undefined;
  const street = `${str(a['streetName'])} ${str(a['streetNumber'])}`.trim();
  const zipCity = `${str(a['zipCode'])} ${str(a['city'])}`.trim();
  if (!str(a['streetName']) || !str(a['city'])) return undefined;
  return { street, zipCity };
}

/**
 * DeepSign Text Field Pattern (spec 2026-05-25 §3). The bare form `#deepsign#<email>#` is verified
 * (meeting minutes); the order suffix is verified in plan Task 10 — keep it in this ONE constant.
 */
export const SIGN_ORDER_PATTERN = (email: string, order: number): string => `#deepsign#${email}#${order}#`;
const PARALLEL_PATTERN = (email: string): string => `#deepsign#${email}#`;

export function buildSignatureBlocks(
  signers: ContractSigner[], resolved: ResolvedSigner[], opts: { ordered: boolean } = { ordered: true },
): SignatureBlock[] {
  return signers.map((s, i) => {
    const r = resolved[i];
    if (!r?.email) throw new Error(`signer ${i} (${s.label}) has no email`);
    return {
      pattern: opts.ordered ? SIGN_ORDER_PATTERN(r.email, s.signOrder) : PARALLEL_PATTERN(r.email),
      name: r.name, label: s.label, signOrder: s.signOrder,
    };
  });
}

export interface ContractPayloadInput {
  applicant: { name: string } & PostalAddress;
  today: string;
  terms: Record<string, string>;
  signatureBlocks: SignatureBlock[];
}

export function buildContractPayload(input: ContractPayloadInput): Record<string, unknown> {
  return {
    applicant: input.applicant,
    date: convertDateFormatToString(input.today, DateFormat.StoreDate, DateFormat.ViewDate),
    terms: input.terms,
    signatureBlocks: input.signatureBlocks,
  };
}

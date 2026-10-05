// apps/functions/src/contract/contract-request.util.ts
//
// Pure helpers of the contract request flow (spec 1.87 §6.2, §6.4). No Firestore here: the
// callable and the workflow deps load the documents, these functions decide.
import { ContractSigner } from '@okr/shared-models';
import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';

export type DocData = Record<string, unknown>;
export type EligibilityRefusal = 'notActive' | 'openRequest' | 'noAddress';

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
    return state === 'approved' && !filed.has(sourceRef) && signingAlive(sourceRef);
  });
}

/** The first refusal, or undefined when the person may apply. */
export function checkContractEligibility(input: EligibilityInput): EligibilityRefusal | undefined {
  if (input.eligibility.includes('activeMember') &&
      !input.memberships.some((m) => isActiveMembership(m, input.orgKey, input.today))) return 'notActive';
  if (input.eligibility.includes('noOpenRequest') && hasOpenRequest(input)) return 'openRequest';
  if (!input.postalAddress) return 'noAddress';
  return undefined;
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

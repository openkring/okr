import { ContractDocumentRef } from '@okr/shared-models';

export type DocData = Record<string, unknown>;
export interface ContractViewer { tenantIds: string[]; roles: Record<string, boolean>; personKey: string; }

export const MAX_CONTRACT_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_CONTRACT_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'text/plain', 'message/rfc822',
];

const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const has = (v: ContractViewer, r: string) => v.roles?.[r] === true;
const arr = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : []);

export function canWriteContracts(v: ContractViewer): boolean {
  return has(v, 'admin') || has(v, 'treasurer');
}

/** Server-side twin of firestore.rules contractReader (spec §5.1). */
export function canReadContractData(v: ContractViewer, d: DocData | undefined): boolean {
  if (!d) return false;
  const inTenant = arr(d['tenants']).some((t) => v.tenantIds.includes(t));
  const strict = d['isStrictlyConfidential'] !== false;
  const staff = canWriteContracts(v) || ((has(v, 'privileged') || has(v, 'auditor')) && !strict);
  if (inTenant && staff) return true;
  return !!v.personKey && arr(d['partyPersonKeys']).includes(v.personKey);
}

export function contractDocumentPath(tenantId: string, contractKey: string, docKey: string, fileName: string): string {
  for (const k of [tenantId, contractKey, docKey]) if (!KEY_RE.test(k)) throw new Error(`invalid key: ${k}`);
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(fileName ?? '');
  const ext = m ? m[1].toLowerCase() : 'bin';
  return `tenant/${tenantId}/contracts/${contractKey}/${docKey}.${ext}`;
}

/**
 * Idempotent: a ref with the same docKey is replaced in place (a retried register never duplicates;
 * the prior version, if also listed, is dropped). Else the prior version is replaced in place, else appended.
 */
export function upsertDocumentRef(refs: ContractDocumentRef[], ref: ContractDocumentRef, priorVersionKey: string): ContractDocumentRef[] {
  const list = refs ?? [];
  const own = list.findIndex((r) => r.docKey === ref.docKey);
  if (own >= 0) {
    return list
      .map((r, j) => (j === own ? withShareOf(ref, r) : r))
      .filter((r, j) => j === own || (r.docKey !== ref.docKey && !(priorVersionKey && r.docKey === priorVersionKey)));
  }
  const i = priorVersionKey ? list.findIndex((r) => r.docKey === priorVersionKey) : -1;
  return i >= 0 ? list.map((r, j) => (j === i ? withShareOf(ref, r) : r)) : [...list, ref];
}

/**
 * The member share (spec 1.97 §5.1) follows the file across versions and register retries. Written
 * only when true: the admin SDK rejects `undefined`, and a legacy ref without the field reads as false.
 */
function withShareOf(ref: ContractDocumentRef, previous: ContractDocumentRef): ContractDocumentRef {
  const shared = ref.sharedWithMembers ?? previous.sharedWithMembers === true;
  const { sharedWithMembers: _drop, ...rest } = ref;
  void _drop;
  return shared ? { ...rest, sharedWithMembers: true } : rest;
}

/** A missing strictness flag counts as strict, as everywhere else in this file. */
const isStrict = (d: DocData): boolean => d['isStrictlyConfidential'] !== false;

/** spec 1.97 §5.2: a strictly confidential contract never shares a file with members. */
export function canShareContractDocument(d: DocData | undefined): boolean {
  return !!d && !isStrict(d);
}

/**
 * spec 1.97 §5.3: the files of a contract that a member of its tenant may open. Empty for every
 * refusal (other tenant, no member role, archived, strictly confidential, nothing shared), so the
 * caller cannot tell the cases apart.
 */
export function sharedDocumentRefs(v: ContractViewer, d: DocData | undefined): ContractDocumentRef[] {
  if (!d || d['isArchived'] === true || isStrict(d)) return [];
  if (!arr(d['tenants']).some((t) => v.tenantIds.includes(t))) return [];
  if (!has(v, 'registered') && !has(v, 'admin')) return [];
  const docs = Array.isArray(d['documents']) ? (d['documents'] as ContractDocumentRef[]) : [];
  return docs.filter((r) => r?.sharedWithMembers === true && KEY_RE.test(String(r.docKey ?? '')));
}

export function pickSummarySource(refs: ContractDocumentRef[]): ContractDocumentRef | undefined {
  const contracts = (refs ?? []).filter((r) => r.role === 'contract');
  return [...contracts].reverse().find((r) => r.docState === 'signed')
    ?? [...contracts].reverse().find((r) => r.docState === 'final')
    ?? contracts[contracts.length - 1];
}

const RESTAMP_FIELDS = ['partyPersonKeys', 'isStrictlyConfidential', 'confidentiality', 'tenants'];

export function needsRestamp(before: DocData | undefined, after: DocData | undefined): boolean {
  if (!after) return false;
  return RESTAMP_FIELDS.some((f) => JSON.stringify(before?.[f] ?? null) !== JSON.stringify(after[f] ?? null));
}

/** Strict-safe stamp for contract-document files: a missing flag counts as strictly confidential. */
export function buildContractDocumentStamp(after: DocData): {
  partyPersonKeys: string[]; isStrictlyConfidential: boolean; confidentiality: unknown; tenants: string[];
} {
  const strict = after['isStrictlyConfidential'] !== false;
  return {
    partyPersonKeys: arr(after['partyPersonKeys']),
    isStrictlyConfidential: strict,
    confidentiality: after['confidentiality'] ?? (strict ? 'strictlyConfidential' : 'internal'),
    tenants: arr(after['tenants']),
  };
}

import { ContractDocState, ContractDocumentRef, ContractDocumentRole, DeadlineKind } from '@okr/shared-models';
import { getExtensionFromMimeType, reduceLogoName, resolveMimeType } from '@okr/shared-util-core';

/** Dossier groups, in display order (spec 1.5 §7). */
export const CONTRACT_DOCUMENT_ROLES: ContractDocumentRole[] = ['contract', 'annex', 'amendment', 'correspondence', 'other'];
export const CONTRACT_DOC_STATES: ContractDocState[] = ['draft', 'redline', 'final', 'signed'];
export const DEADLINE_KINDS: DeadlineKind[] = ['notice', 'end', 'rateFix'];

/** Client twin of apps/functions/src/contract/contract-document.util.ts — keep both in step. */
export const MAX_CONTRACT_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_CONTRACT_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'text/plain', 'message/rfc822',
];
/**
 * `accept` value for the dossier's file input: the mime types plus bare extensions, so a file whose
 * type the browser cannot name (HEIC on Chrome, .eml on some systems) is not greyed out.
 */
export const CONTRACT_ACCEPT_ATTRIBUTE = [
  ...ALLOWED_CONTRACT_MIME_TYPES, '.pdf', '.jpg', '.jpeg', '.png', '.heic', '.doc', '.docx', '.odt', '.txt', '.eml',
].join(',');

export interface ContractDocumentGroup { role: ContractDocumentRole; documents: ContractDocumentRef[]; }

/** Non-empty groups in CONTRACT_DOCUMENT_ROLES order; an unknown role falls into 'other'. */
export function groupDocumentsByRole(refs: ContractDocumentRef[] | undefined): ContractDocumentGroup[] {
  const byRole = new Map<ContractDocumentRole, ContractDocumentRef[]>();
  for (const ref of refs ?? []) {
    const role = CONTRACT_DOCUMENT_ROLES.includes(ref.role) ? ref.role : 'other';
    byRole.set(role, [...(byRole.get(role) ?? []), ref]);
  }
  return CONTRACT_DOCUMENT_ROLES.filter((r) => byRole.has(r)).map((role) => ({ role, documents: byRole.get(role) ?? [] }));
}

/** A stable string of the dossier's doc keys: re-sign only when it changes. */
export function documentKeysSignature(refs: ContractDocumentRef[] | undefined): string {
  return (refs ?? []).map((r) => r.docKey).join('|');
}

/** The mime type the upload declares: the browser's, else derived from the extension (resolveMimeType rule). */
export function contractFileMimeType(fileName: string, declared: string | undefined): string {
  return resolveMimeType(fileName, declared) ?? '';
}

export interface ReminderMarker { kind: DeadlineKind; date: string; lead: number; }

/** Parses a `remindersSent` marker `kind:yyyyMMdd:lead`; undefined if malformed. */
export function parseReminderMarker(marker: string): ReminderMarker | undefined {
  const [kind, date, lead, ...rest] = (marker ?? '').split(':');
  if (rest.length || !DEADLINE_KINDS.includes(kind as DeadlineKind) || !/^\d{8}$/.test(date ?? '') || !/^\d+$/.test(lead ?? '')) {
    return undefined;
  }
  return { kind: kind as DeadlineKind, date, lead: Number(lead) };
}

/** Parsed markers, malformed ones dropped, sorted by date then by lead (largest first, i.e. the order they were sent). */
export function parseReminderMarkers(markers: string[] | undefined): ReminderMarker[] {
  return (markers ?? [])
    .map(parseReminderMarker)
    .filter((m): m is ReminderMarker => !!m)
    .sort((a, b) => a.date.localeCompare(b.date) || b.lead - a.lead);
}

/** Name of the file-type icon (icon set `filetypes`) for a stored mime type; 'file' when unknown. */
export function contractFileIconName(mimeType: string | undefined): string {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  return reduceLogoName(getExtensionFromMimeType(mimeType).toLowerCase());
}

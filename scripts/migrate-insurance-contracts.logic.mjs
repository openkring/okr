/**
 * Pure planning helpers for migrate-insurance-contracts.mjs (spec 1.97 §7). No Firebase here, so
 * the plan is unit-tested in migrate-insurance-contracts.test.mjs.
 */

/** ButtonAction is stored as its number; ContractDocument is the 9th value (spec 1.97 §4). */
export const BUTTON_ACTION_DOWNLOAD = 0;
export const BUTTON_ACTION_CONTRACT_DOCUMENT = 8;

export const TENANT_ID = 'scs';

/**
 * The seven policy buttons on pages/f_versicherung (spec 1.97 §2). The Merkblatt
 * (8ti0scmm9bapt8wnole6) is a club leaflet and deliberately not listed.
 */
export const POLICY_SECTIONS = [
  { sectionKey: '37t4cviac3jc4evymgkb', name: 'Gebäudeversicherung GVZ', insurer: 'GVZ' },
  { sectionKey: 'b070qxix2rjz8765bvvw', name: 'Sachversicherung AXA', insurer: 'AXA' },
  { sectionKey: 'ixbekdd6z5ssfsn4zrle', name: 'Gebäudesachversicherung AXA', insurer: 'AXA' },
  { sectionKey: 'q3ribu6aoxdi22xlnz1f', name: 'Haftpflichtversicherung AXA', insurer: 'AXA' },
  { sectionKey: 'a9t4ofh5wkbto3rmf352', name: 'Transportversicherung AXA', insurer: 'AXA' },
  { sectionKey: 'o4v7q3khtz3smrjoj8bb', name: 'Wasserfahrzeugversicherung AXA (ZH 7563)', insurer: 'AXA' },
  { sectionKey: '4waqlmw9hxrtjq1fimkk', name: 'Personenversicherung AXA', insurer: 'AXA' },
];

export const contractIdOf = (sectionKey) => `ins_${sectionKey}`;
export const documentIdOf = (sectionKey) => `ins_${sectionKey}_1`;

/** StoreDate (yyyymmdd) from the file-name prefix; a `00` month or day becomes `01`. '' when there is none. */
export function startDateFromFileName(fileName) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(fileName ?? '');
  if (!m) return '';
  const [, y, mo, d] = m;
  const month = mo === '00' ? '01' : mo;
  const day = d === '00' ? '01' : d;
  if (Number(month) > 12 || Number(day) > 31) return '';
  return `${y}${month}${day}`;
}

/** The object path inside the default bucket from a Firebase Storage download URL, '' if it is none. */
export function storagePathFromDownloadUrl(url) {
  const m = /\/o\/([^?]+)/.exec(url ?? '');
  return m ? decodeURIComponent(m[1]) : '';
}

/** Same layout as contractDocumentPath in apps/functions/src/contract/contract-document.util.ts. */
export function contractDocumentPath(tenantId, contractKey, docKey, fileName) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(fileName ?? '');
  return `tenant/${tenantId}/contracts/${contractKey}/${docKey}.${m ? m[1].toLowerCase() : 'bin'}`;
}

/** File name of a section's PDF: the alt text the author uploaded with, else the last path segment. */
export function fileNameOf(section) {
  const alt = String(section?.properties?.action?.altText ?? '').trim();
  if (alt) return alt;
  return storagePathFromDownloadUrl(section?.properties?.action?.url).split('/').pop() ?? '';
}

/**
 * What to do with one policy section:
 * - 'migrate': a download button with a default-bucket file
 * - 'done':    already points at this policy's contract (a re-run)
 * - 'skip':    anything else, with a reason; never touched
 */
export function planSection(entry, section) {
  if (!section) return { action: 'skip', reason: 'section not found' };
  if (!(section.tenants ?? []).includes(TENANT_ID)) return { action: 'skip', reason: 'not a scs section' };
  const action = section.properties?.action ?? {};
  if (action.type === BUTTON_ACTION_CONTRACT_DOCUMENT) {
    return action.url === contractIdOf(entry.sectionKey)
      ? { action: 'done' }
      : { action: 'skip', reason: `points at another contract (${action.url})` };
  }
  if (action.type !== BUTTON_ACTION_DOWNLOAD) return { action: 'skip', reason: `action type ${action.type}` };
  const sourcePath = storagePathFromDownloadUrl(action.url);
  if (!sourcePath.startsWith(`tenant/${TENANT_ID}/section/${entry.sectionKey}/`)) {
    return { action: 'skip', reason: `unexpected file location (${sourcePath || action.url})` };
  }
  return { action: 'migrate', sourcePath, fileName: fileNameOf(section) };
}

/** The org avatar of `insurer` among the tenant's orgs (case-insensitive name match), or undefined. */
export function findInsurerOrg(orgs, insurer) {
  const want = insurer.toLowerCase();
  const hit = (orgs ?? []).find((o) => !o.isArchived && String(o.name ?? '').trim().toLowerCase().startsWith(want));
  return hit ? orgAvatar(hit.okey, hit.name) : undefined;
}

export const orgAvatar = (key, name) => ({ key, name1: '', name2: String(name ?? key), modelType: 'org', type: '', subType: '', label: '' });

/**
 * The contract document, shaped like ContractModel minus okey, with the fields applyDerivedFields
 * would set: org-only parties derive no partyPersonKeys, 'internal' is not strict, and an
 * open-ended contract without notice terms has no deadline.
 */
export function buildInsuranceContract(entry, fileName, ownOrg, insurerOrg, docRef) {
  const parties = [{ role: 'internal', avatar: ownOrg }];
  if (insurerOrg) parties.push({ role: 'counterparty', avatar: insurerOrg });
  const partyNames = parties.map((p) => `${p.avatar.name1} ${p.avatar.name2}`.trim()).filter(Boolean).join(' ');
  return {
    tenants: [TENANT_ID], isArchived: false, tags: '', name: entry.name, notes: '',
    index: `n:${entry.name} t:insurance nr: p:${partyNames}`,
    contractType: 'insurance', contractNumber: '', state: 'active',
    parties, partyPersonKeys: [],
    signingDate: '', startDate: startDateFromFileName(fileName), endDate: '',
    autoRenewMonths: 0, noticeGivenDate: '', noticeGivenBy: '', effectiveEndDate: '',
    nextDeadline: '', nextDeadlineKind: '', reminderLeadDays: [], remindersSent: [],
    billingCycle: '',
    confidentiality: 'internal', isStrictlyConfidential: false,
    documents: [docRef],
    abstract: '', abstractSource: '', sourceRef: `section.${entry.sectionKey}`,
  };
}

/** The contract-documents doc, shaped like the one registerContractDocument writes. */
export function buildContractDocument({ title, path, size, contractKey, today }) {
  return {
    isArchived: false, index: `n:${title}`, tags: '', folderKeys: [],
    fullPath: path, description: '', title, altText: title, type: 'legal', source: 'storage', credit: '', url: '',
    mimeType: 'application/pdf', size,
    authorKey: '', authorName: 'Migration 1.97', dateOfDocCreation: today, dateOfDocLastUpdate: today,
    locationKey: '', hash: '', priorVersionKey: '', version: '1', renderings: [],
    contractKey,
    // the stamp onContractWritten keeps in step with the contract (buildContractDocumentStamp)
    partyPersonKeys: [], isStrictlyConfidential: false, confidentiality: 'internal', tenants: [TENANT_ID],
  };
}

/**
 * --delete-originals is allowed for a section only when its button already opens an existing
 * contract that shares at least one file.
 */
export function canDeleteOriginal(entry, section, contract) {
  const action = section?.properties?.action ?? {};
  if (action.type !== BUTTON_ACTION_CONTRACT_DOCUMENT || action.url !== contractIdOf(entry.sectionKey)) return false;
  return !!contract && !contract.isArchived && (contract.documents ?? []).some((d) => d?.sharedWithMembers === true);
}

// apps/functions/src/contract/file-contract.ts
//
// A fully signed DeepSign PDF becomes a contract dossier (spec 1.87 §6.6). The PDF is COPIED from the
// default bucket (esign archive) into the private bucket where contract files live.
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { AvatarInfo, ContractCollection, ContractDocumentCollection, ContractModel, NoticePeriod } from '@okr/shared-models';
import { applyDerivedFields } from '@okr/business-contract-util';
import { privateBucket } from '../_storage/private-bucket';
import { buildContractDocumentStamp, contractDocumentPath } from './contract-document.util';
import type { FileContractRequest } from '../workflow/types';

const months = (v: string | undefined): NoticePeriod | undefined =>
  Number(v) > 0 ? { duration: Number(v), unit: 'months' } : undefined;

/** Deterministic ids: one approval can only ever produce one contract dossier, even on overlapping deliveries. */
export function signedContractIds(sourceRef: string): { contractId: string; documentId: string } {
  const contractId = `sr_${sourceRef.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  return { contractId, documentId: `${contractId}_signed` };
}

export function buildSignedContract(req: FileContractRequest, orgAvatar: AvatarInfo): ContractModel {
  const c = new ContractModel(req.tenantId);
  const applicantName = `${req.applicant.name1 ?? ''} ${req.applicant.name2 ?? ''}`.trim();
  c.name = (req.kindDoc.contractName || `${req.kindDoc.name ?? req.kind} {name}`).replace('{name}', applicantName).trim();
  c.contractType = (req.kindDoc.contractType ?? 'lease') as ContractModel['contractType'];
  c.state = 'active';
  c.parties = [{ role: 'internal', avatar: orgAvatar }, { role: 'counterparty', avatar: req.applicant }];
  c.signingDate = req.today;
  c.startDate = req.today;
  c.endDate = '';
  c.notice = { ours: months(req.kindDoc.terms?.['noticeOursMonths']), theirs: months(req.kindDoc.terms?.['noticeTheirsMonths']), to: 'monthEnd' };
  c.tags = `contract:${req.kind}`;
  c.sourceRef = req.sourceRef;
  c.confidentiality = 'internal';
  return applyDerivedFields(c, req.today);
}

/**
 * The esign archive copy sits in the default bucket under a tenant-readable prefix; once the
 * contract dossier holds its private-bucket copy, the archive copy goes. Never throws: the
 * contract is filed, a stray file is a cleanup matter, not a failed workflow step.
 */
async function removeEsignCopy(signedPdfPath: string, sourceRef: string): Promise<void> {
  try {
    await getStorage().bucket().file(signedPdfPath).delete({ ignoreNotFound: true });
  } catch (e) {
    logger.warn(`fileSignedContract: could not delete the esign copy for ${sourceRef}`,
      { error: e instanceof Error ? e.message : String(e) });
  }
}

export async function fileSignedContract(req: FileContractRequest): Promise<string> {
  const db = getFirestore();
  const org = (await db.collection('orgs').doc(req.orgKey).get()).data() ?? {};
  const orgAvatar: AvatarInfo = { key: req.orgKey, name1: '', name2: String(org['name'] ?? req.orgKey),
    modelType: 'org', type: '', subType: '', label: '' };
  const contract = buildSignedContract(req, orgAvatar);
  const ids = signedContractIds(req.sourceRef);
  const contractRef = db.collection(ContractCollection).doc(ids.contractId);
  const docRef = db.collection(ContractDocumentCollection).doc(ids.documentId);
  const path = contractDocumentPath(req.tenantId, contractRef.id, docRef.id, 'signed.pdf');

  // A re-delivered esign.completed after a successful filing: the archive copy may already be
  // gone, so do not try to download it again.
  if ((await contractRef.get()).exists) {
    await removeEsignCopy(req.signedPdfPath, req.sourceRef);
    return contractRef.id;
  }

  const [buffer] = await getStorage().bucket().file(req.signedPdfPath).download();
  await privateBucket().file(path).save(buffer, { metadata: { contentType: 'application/pdf' } });

  const title = `${contract.name} (unterschrieben)`;
  const { okey, ...contractDoc } = contract;
  void okey;
  contractDoc.documents = [{ docKey: docRef.id, role: 'contract', title, docState: 'signed' }];
  const batch = db.batch();
  batch.create(contractRef, contractDoc);
  batch.create(docRef, {
    isArchived: false, index: `n:${title}`, tags: '', folderKeys: [],
    fullPath: path, description: '', title, altText: title, type: 'legal', source: 'storage', credit: '', url: '',
    mimeType: 'application/pdf', size: buffer.length,
    authorKey: '', authorName: 'DeepSign', dateOfDocCreation: req.today, dateOfDocLastUpdate: req.today,
    locationKey: '', hash: '', priorVersionKey: '', version: '1', renderings: [],
    contractKey: contractRef.id,
    ...buildContractDocumentStamp(contractDoc as unknown as Record<string, unknown>),
  });
  try {
    await batch.commit();
  } catch (e) {
    // gRPC ALREADY_EXISTS: a parallel delivery filed this approval first — that is the result we want.
    if ((e as { code?: number }).code !== 6) throw e;
  }
  await removeEsignCopy(req.signedPdfPath, req.sourceRef);
  return contractRef.id;
}

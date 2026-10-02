import { enforce, only, staticSuite, test } from 'vest';
import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { ContractDocState, ContractDocumentRole } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

import { ALLOWED_CONTRACT_MIME_TYPES, CONTRACT_DOC_STATES, CONTRACT_DOCUMENT_ROLES, MAX_CONTRACT_FILE_BYTES } from './contract-dossier.util';

/**
 * What the dossier's upload form edits. The picked `File` itself stays with the modal; the form only
 * sees its name, size and resolved mime type, so the suite can reject a wrong or oversize file early.
 */
export interface ContractDocumentUploadData {
  role: ContractDocumentRole;
  title: string;
  docState: ContractDocState;
  /** '' = a new file; else the docKey of the ref this upload replaces */
  priorVersionKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export function newContractDocumentUploadData(): ContractDocumentUploadData {
  return { role: 'contract', title: '', docState: 'final', priorVersionKey: '', fileName: '', fileSize: 0, mimeType: '' };
}

const V = '@business/contract/util.validation.';

export const contractDocumentUploadValidations = staticSuite((model: ContractDocumentUploadData, field?: string) => {
  if (field) only(field);
  test('role', V + 'docRole', () => { enforce(CONTRACT_DOCUMENT_ROLES.includes(model.role)).isTruthy(); });
  test('docState', V + 'docState', () => { enforce(CONTRACT_DOC_STATES.includes(model.docState)).isTruthy(); });
  stringValidations('title', model.title, LONG_NAME_LENGTH);
  // all file problems are filed under fileName: that is where the note sits
  test('fileName', V + 'fileMissing', () => { enforce(model.fileName).isNotEmpty(); });
  test('fileName', V + 'fileType', () => {
    if (model.fileName) enforce(ALLOWED_CONTRACT_MIME_TYPES.includes(model.mimeType)).isTruthy();
  });
  test('fileName', V + 'fileSize', () => {
    if (model.fileName) enforce(model.fileSize > 0 && model.fileSize <= MAX_CONTRACT_FILE_BYTES).isTruthy();
  });
});

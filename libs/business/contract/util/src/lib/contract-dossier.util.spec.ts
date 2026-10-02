import { describe, expect, it } from 'vitest';
import { ContractDocumentRef } from '@okr/shared-models';
import {
  contractFileIconName, contractFileMimeType, CONTRACT_ACCEPT_ATTRIBUTE, documentKeysSignature, groupDocumentsByRole, MAX_CONTRACT_FILE_BYTES,
  parseReminderMarker, parseReminderMarkers, pickFreshUrl,
} from './contract-dossier.util';
import { contractDocumentUploadValidations, newContractDocumentUploadData } from './contract-document.validations';

const ref = (docKey: string, role: ContractDocumentRef['role']): ContractDocumentRef => ({ docKey, role, title: docKey, docState: 'final' });

describe('groupDocumentsByRole', () => {
  it('groups in the fixed role order and drops empty groups', () => {
    const groups = groupDocumentsByRole([ref('c1', 'correspondence'), ref('k1', 'contract'), ref('a1', 'annex'), ref('k2', 'contract')]);
    expect(groups.map((g) => g.role)).toEqual(['contract', 'annex', 'correspondence']);
    expect(groups[0].documents.map((d) => d.docKey)).toEqual(['k1', 'k2']);
  });
  it('puts an unknown role into other', () => {
    const groups = groupDocumentsByRole([ref('x', 'bogus' as ContractDocumentRef['role'])]);
    expect(groups).toEqual([{ role: 'other', documents: [ref('x', 'bogus' as ContractDocumentRef['role'])] }]);
  });
  it('handles undefined', () => {
    expect(groupDocumentsByRole(undefined)).toEqual([]);
  });
});

describe('documentKeysSignature', () => {
  it('changes only with the key list', () => {
    expect(documentKeysSignature([ref('a', 'contract'), ref('b', 'annex')])).toBe('a|b');
    expect(documentKeysSignature([{ ...ref('a', 'contract'), title: 'other' }, ref('b', 'annex')])).toBe('a|b');
    expect(documentKeysSignature(undefined)).toBe('');
  });
});

describe('contractFileMimeType', () => {
  it('keeps the declared type', () => {
    expect(contractFileMimeType('x.pdf', 'application/pdf')).toBe('application/pdf');
  });
  it('falls back to the extension when the browser reports none', () => {
    expect(contractFileMimeType('IMG_1.heic', '')).toBe('image/heic');
    expect(contractFileMimeType('mail.eml', '')).toBe('message/rfc822');
  });
});

describe('CONTRACT_ACCEPT_ATTRIBUTE', () => {
  it('carries mime types and bare extensions', () => {
    expect(CONTRACT_ACCEPT_ATTRIBUTE).toContain('application/pdf');
    expect(CONTRACT_ACCEPT_ATTRIBUTE).toContain('.heic');
    expect(CONTRACT_ACCEPT_ATTRIBUTE).toContain('.eml');
  });
});

describe('parseReminderMarker', () => {
  it('parses kind:date:lead', () => {
    expect(parseReminderMarker('notice:20261231:30')).toEqual({ kind: 'notice', date: '20261231', lead: 30 });
  });
  it('rejects malformed markers', () => {
    expect(parseReminderMarker('foo:20261231:30')).toBeUndefined();
    expect(parseReminderMarker('end:2026-12-31:30')).toBeUndefined();
    expect(parseReminderMarker('end:20261231')).toBeUndefined();
    expect(parseReminderMarker('end:20261231:7:x')).toBeUndefined();
  });
  it('sorts by date, then largest lead first, dropping junk', () => {
    expect(parseReminderMarkers(['end:20270101:7', 'x', 'notice:20261231:7', 'notice:20261231:90']).map((m) => `${m.date}/${m.lead}`))
      .toEqual(['20261231/90', '20261231/7', '20270101/7']);
  });
});

describe('contractDocumentUploadValidations', () => {
  const valid = { ...newContractDocumentUploadData(), fileName: 'v.pdf', fileSize: 1000, mimeType: 'application/pdf' };
  it('accepts a pdf with defaults', () => {
    expect(contractDocumentUploadValidations(valid).isValid()).toBe(true);
  });
  it('requires a file', () => {
    const r = contractDocumentUploadValidations(newContractDocumentUploadData());
    expect(r.getErrors('fileName')).toEqual(['@business/contract/util.validation.fileMissing']);
  });
  it('rejects a disallowed type', () => {
    const r = contractDocumentUploadValidations({ ...valid, fileName: 'x.zip', mimeType: 'application/zip' });
    expect(r.getErrors('fileName')).toEqual(['@business/contract/util.validation.fileType']);
  });
  it('rejects an oversize file', () => {
    const r = contractDocumentUploadValidations({ ...valid, fileSize: MAX_CONTRACT_FILE_BYTES + 1 });
    expect(r.getErrors('fileName')).toEqual(['@business/contract/util.validation.fileSize']);
  });
  it('rejects an unknown role or state', () => {
    const r = contractDocumentUploadValidations({ ...valid, role: 'x' as never, docState: 'y' as never });
    expect(r.getErrors('role').length).toBe(1);
    expect(r.getErrors('docState').length).toBe(1);
  });
});

describe('contractFileIconName', () => {
  it('maps stored mime types to file-type icons', () => {
    expect(contractFileIconName('application/pdf')).toBe('pdf');
    expect(contractFileIconName('image/heic')).toBe('image');
    expect(contractFileIconName('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('doc');
    expect(contractFileIconName('text/plain')).toBe('txt');
    expect(contractFileIconName('message/rfc822')).toBe('file');
    expect(contractFileIconName('')).toBe('file');
  });
});

describe('pickFreshUrl', () => {
  it('uses the entry only after a successful re-sign', () => {
    expect(pickFreshUrl(true, { url: 'https://new' })).toBe('https://new');
  });
  it('never falls back to an expired entry when the re-sign failed', () => {
    expect(pickFreshUrl(false, { url: 'https://expired' })).toBeUndefined();
  });
  it('returns undefined for a missing or empty entry', () => {
    expect(pickFreshUrl(true, undefined)).toBeUndefined();
    expect(pickFreshUrl(true, { url: '' })).toBeUndefined();
  });
});

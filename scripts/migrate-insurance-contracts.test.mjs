import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUTTON_ACTION_CONTRACT_DOCUMENT, BUTTON_ACTION_DOWNLOAD, buildContractDocument, buildInsuranceContract, canDeleteOriginal,
  contractDocumentPath, contractIdOf, fileNameOf, findInsurerOrg, orgAvatar, planSection, POLICY_SECTIONS, startDateFromFileName,
  storagePathFromDownloadUrl,
} from './migrate-insurance-contracts.logic.mjs';

const entry = POLICY_SECTIONS.find((e) => e.sectionKey === 'q3ribu6aoxdi22xlnz1f');
const url = 'https://firebasestorage.googleapis.com/v0/b/bkaiser-org.appspot.com/o/tenant%2Fscs%2Fsection%2Fq3ribu6aoxdi22xlnz1f%2Ffile%2F20220101scsAxaAntragHaftpflichtversicherung.pdf?alt=media&token=abc';
const section = (action, tenants = ['scs']) => ({ tenants, properties: { action } });
const download = section({ type: BUTTON_ACTION_DOWNLOAD, url, altText: '20220101scsAxaAntragHaftpflichtversicherung.pdf' });

test('the Merkblatt is not a policy and is never migrated', () => {
  assert.equal(POLICY_SECTIONS.length, 7);
  assert.equal(POLICY_SECTIONS.some((e) => e.sectionKey === '8ti0scmm9bapt8wnole6'), false);
});

test('startDateFromFileName reads the yyyymmdd prefix and lifts 00 to 01', () => {
  assert.equal(startDateFromFileName('20220617scsAxaTransportversicherungPolice.pdf'), '20220617');
  assert.equal(startDateFromFileName('20150300avbAxaPersonenversicherung.pdf'), '20150301');
  assert.equal(startDateFromFileName('20080000scsMerkblatt.pdf'), '20080101');
  assert.equal(startDateFromFileName('police.pdf'), '');
  assert.equal(startDateFromFileName('20221399x.pdf'), '');
});

test('storagePathFromDownloadUrl decodes the object path', () => {
  assert.equal(storagePathFromDownloadUrl(url), 'tenant/scs/section/q3ribu6aoxdi22xlnz1f/file/20220101scsAxaAntragHaftpflichtversicherung.pdf');
  assert.equal(storagePathFromDownloadUrl('https://example.com/x.pdf'), '');
});

test('contractDocumentPath matches the Cloud Function layout', () => {
  assert.equal(contractDocumentPath('scs', 'ins_a', 'ins_a_1', 'Police.PDF'), 'tenant/scs/contracts/ins_a/ins_a_1.pdf');
});

test('fileNameOf prefers the alt text, else the last path segment', () => {
  assert.equal(fileNameOf(download), '20220101scsAxaAntragHaftpflichtversicherung.pdf');
  assert.equal(fileNameOf(section({ type: 0, url, altText: '' })), '20220101scsAxaAntragHaftpflichtversicherung.pdf');
});

test('planSection: a download button is migrated', () => {
  const p = planSection(entry, download);
  assert.equal(p.action, 'migrate');
  assert.equal(p.sourcePath, 'tenant/scs/section/q3ribu6aoxdi22xlnz1f/file/20220101scsAxaAntragHaftpflichtversicherung.pdf');
});

test('planSection: a re-run sees its own contract as done', () => {
  assert.deepEqual(planSection(entry, section({ type: BUTTON_ACTION_CONTRACT_DOCUMENT, url: contractIdOf(entry.sectionKey) })), { action: 'done' });
});

test('planSection: never touches a foreign tenant, another contract, another action or a foreign file', () => {
  assert.equal(planSection(entry, undefined).action, 'skip');
  assert.equal(planSection(entry, { ...download, tenants: ['kring'] }).action, 'skip');
  assert.equal(planSection(entry, section({ type: BUTTON_ACTION_CONTRACT_DOCUMENT, url: 'other' })).action, 'skip');
  assert.equal(planSection(entry, section({ type: 1, url: '/private/x' })).action, 'skip');
  assert.equal(planSection(entry, section({ type: 0, url: url.replace('q3ribu6aoxdi22xlnz1f', 'zzz') })).action, 'skip');
});

test('findInsurerOrg matches by name prefix, ignoring case and archived orgs', () => {
  const orgs = [{ okey: 'o1', name: 'AXA Versicherungen AG', isArchived: true }, { okey: 'o2', name: 'axa Winterthur' }];
  assert.equal(findInsurerOrg(orgs, 'AXA')?.key, 'o2');
  assert.equal(findInsurerOrg(orgs, 'GVZ'), undefined);
});

test('buildInsuranceContract: shared policy, internal, open-ended, without the insurer when unknown', () => {
  const ref = { docKey: 'd', role: 'contract', title: 't', docState: 'final', sharedWithMembers: true };
  const c = buildInsuranceContract(entry, '20220101x.pdf', orgAvatar('scs', 'Seeclub Stäfa'), undefined, ref);
  assert.equal(c.contractType, 'insurance');
  assert.equal(c.state, 'active');
  assert.equal(c.isStrictlyConfidential, false);
  assert.equal(c.startDate, '20220101');
  assert.deepEqual(c.parties.map((p) => p.role), ['internal']);
  assert.deepEqual(c.documents, [ref]);
  assert.equal(c.index, 'n:Haftpflichtversicherung AXA t:insurance nr: p:Seeclub Stäfa');
  const withInsurer = buildInsuranceContract(entry, 'x.pdf', orgAvatar('scs', 'SCS'), orgAvatar('o2', 'AXA'), ref);
  assert.deepEqual(withInsurer.parties.map((p) => p.role), ['internal', 'counterparty']);
});

test('buildContractDocument is stamped like an internal contract', () => {
  const d = buildContractDocument({ title: 't', path: 'p', size: 3, contractKey: 'c', today: '20261012' });
  assert.equal(d.isStrictlyConfidential, false);
  assert.deepEqual(d.tenants, ['scs']);
  assert.equal(d.contractKey, 'c');
});

test('canDeleteOriginal only after the button opens a contract that shares a file', () => {
  const moved = section({ type: BUTTON_ACTION_CONTRACT_DOCUMENT, url: contractIdOf(entry.sectionKey) });
  const shared = { documents: [{ docKey: 'd', sharedWithMembers: true }] };
  assert.equal(canDeleteOriginal(entry, moved, shared), true);
  assert.equal(canDeleteOriginal(entry, download, shared), false);
  assert.equal(canDeleteOriginal(entry, moved, undefined), false);
  assert.equal(canDeleteOriginal(entry, moved, { documents: [{ docKey: 'd' }] }), false);
  assert.equal(canDeleteOriginal(entry, moved, { ...shared, isArchived: true }), false);
});

import { describe, expect, it } from 'vitest';
import { buildSignedContract } from './file-contract';

describe('buildSignedContract', () => {
  const anna = { key: 'anna', name1: 'Anna', name2: 'Muster', modelType: 'person', type: '', subType: '', label: '' };
  const scs = { key: 'scs', name1: '', name2: 'Seeclub Stäfa', modelType: 'org', type: '', subType: '', label: '' };
  const c = buildSignedContract({
    tenantId: 'scs', kind: 'skiffPlatz', applicant: anna as never, orgKey: 'scs',
    signedPdfPath: 'p', sourceRef: 'approval.ap1', today: '20261005',
    kindDoc: { name: 'Skiff-Lagerplatz', contractType: 'lease', contractName: 'Skiff-Lagerplatz {name}',
      terms: { noticeOursMonths: '6', noticeTheirsMonths: '1' } },
  }, scs as never);

  it('is an active lease between the org and the applicant', () => {
    expect(c).toMatchObject({ name: 'Skiff-Lagerplatz Anna Muster', contractType: 'lease', state: 'active',
      signingDate: '20261005', startDate: '20261005', endDate: '', sourceRef: 'approval.ap1', tags: 'contract:skiffPlatz',
      confidentiality: 'internal', isStrictlyConfidential: false, partyPersonKeys: ['anna'] });
    expect(c.parties.map((p) => p.role)).toEqual(['internal', 'counterparty']);
  });
  it('takes the notice periods from the kind terms', () => {
    expect(c.notice).toEqual({ ours: { duration: 6, unit: 'months' }, theirs: { duration: 1, unit: 'months' }, to: 'monthEnd' });
  });
});

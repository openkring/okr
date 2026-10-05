import { describe, expect, it } from 'vitest';
import { buildDecisionPatch } from './decision';

const nadia = { key: 'p1', name1: 'Nadia', name2: 'Hungerbühler', modelType: 'person' as const, type: '', subType: '', label: '' };

describe('buildDecisionPatch', () => {
  it('records state, date, note and the person who decided', () => {
    expect(buildDecisionPatch('approved', '', nadia, '20261005 1030')).toEqual({
      state: 'approved', decisionDate: '20261005 1030', decisionNote: '', decidedBy: nadia,
    });
  });
  it('writes no decidedBy key when the caller has no person (never undefined into Firestore)', () => {
    expect(buildDecisionPatch('rejected', 'kein Platz', undefined, '20261005 1030')).toEqual({
      state: 'rejected', decisionDate: '20261005 1030', decisionNote: 'kein Platz',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { approvalSubjectPersonKey } from './approval-person';

describe('approvalSubjectPersonKey', () => {
  it('takes the okey of a person subject', () => {
    expect(approvalSubjectPersonKey({ subjectKey: 'person.abc', requestedBy: { key: 'zzz' } })).toBe('abc');
  });
  it('falls back to the requester for other subjects', () => {
    expect(approvalSubjectPersonKey({ subjectKey: 'reservation.r1', requestedBy: { key: 'zzz' } })).toBe('zzz');
  });
  it('is empty when neither exists', () => {
    expect(approvalSubjectPersonKey({ subjectKey: 'expense.e1' })).toBe('');
  });
});

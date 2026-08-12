import { describe, expect, it } from 'vitest';
import { isActiveMembership } from './membership.util';

const TODAY = '20260812';

describe('isActiveMembership', () => {
  it('is active when dateOfExit is empty', () => {
    expect(isActiveMembership({ dateOfExit: '' }, TODAY)).toBe(true);
  });

  it('is active for the open-end sentinel', () => {
    expect(isActiveMembership({ dateOfExit: '99991231' }, TODAY)).toBe(true);
  });

  it('is STILL ACTIVE for a future exit date (the bug this fixes)', () => {
    expect(isActiveMembership({ dateOfExit: '20261231' }, TODAY)).toBe(true);
  });

  it('is inactive on the day after the exit date', () => {
    expect(isActiveMembership({ dateOfExit: '20260811' }, TODAY)).toBe(false);
  });

  it('is inactive on the exit date itself (membership runs to end of that day)', () => {
    expect(isActiveMembership({ dateOfExit: TODAY }, TODAY)).toBe(false);
  });

  it('is inactive when archived, whatever the date', () => {
    expect(isActiveMembership({ dateOfExit: '', isArchived: true }, TODAY)).toBe(false);
    expect(isActiveMembership({ dateOfExit: '99991231', isArchived: true }, TODAY)).toBe(false);
  });

  it('is inactive for undefined', () => {
    expect(isActiveMembership(undefined, TODAY)).toBe(false);
  });

  it('treats a missing dateOfExit as never-ended', () => {
    expect(isActiveMembership({}, TODAY)).toBe(true);
  });
});

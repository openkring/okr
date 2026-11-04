import { describe, expect, it } from 'vitest';
import { jassRouted } from './jass-routed.util';

describe('jassRouted', () => {
  it('shows the button with a consent for jasstafel', () =>
    expect(jassRouted({ diaryConsents: [{ tenantId: 'bka', uid: 'u', sources: ['jasstafel'] }] }, undefined)).toBe(true));
  it('shows it in a diary app pulling from itself', () =>
    expect(jassRouted({}, { tenantId: 'bka', sources: ['jasstafel'] })).toBe(true));
  it('shows it with an old target', () =>
    expect(jassRouted({ diaryTargets: [{ tenantId: 'bka', sources: ['jasstafel'], from: '', to: '' }] }, undefined)).toBe(true));
  it('hides it for another source', () =>
    expect(jassRouted({ diaryConsents: [{ tenantId: 'bka', uid: 'u', sources: ['taskDone'] }] }, { tenantId: 'bka', sources: ['taskDone'] })).toBe(false));
  it('hides it for a legacy user', () => expect(jassRouted(undefined, undefined)).toBe(false));
});

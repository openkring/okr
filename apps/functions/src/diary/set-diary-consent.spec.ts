import { describe, expect, it } from 'vitest';
import type { DiaryConsent, DiaryPull } from '@okr/shared-models';

import { consentDiaryUid, decideConsent, validateConsentRequest } from './set-diary-consent';

const pull = (...sources: DiaryPull['sources']): DiaryPull => ({ tenantId: 'scs', sources });
const current = (...sources: DiaryConsent['sources']): DiaryConsent[] => [{ tenantId: 'bka', uid: 'uBka', sources }];
const base = { diaryTenantId: 'bka', diaryUid: 'uBka' };

describe('decideConsent', () => {
  it('stores only rows the diary asked for', () => {
    expect(decideConsent({ current: [], ...base, sources: ['taskDone', 'tracker'], pull: pull('taskDone') }).next)
      .toEqual([{ tenantId: 'bka', uid: 'uBka', sources: ['taskDone'] }]);
  });
  it('sweeps when the consent newly gains tracker', () => {
    expect(decideConsent({ current: current('taskDone'), ...base, sources: ['taskDone', 'tracker'], pull: pull('taskDone', 'tracker') }).sweep).toBe(true);
  });
  it('sweeps once: not when tracker was allowed before', () => {
    expect(decideConsent({ current: current('tracker'), ...base, sources: ['tracker'], pull: pull('tracker') }).sweep).toBe(false);
  });
  it('moves nothing when the pull does not ask for tracker', () => {
    const d = decideConsent({ current: [], ...base, sources: ['tracker'], pull: pull('taskDone') });
    expect(d).toEqual({ next: [], sources: [], sweep: false });
  });
  it('revokes with an empty list, also when the diary is gone', () => {
    const others = [{ tenantId: 'jp', uid: 'uJp', sources: ['taskDone' as const] }];
    expect(decideConsent({ current: [...current('tracker'), ...others], ...base, sources: [], pull: undefined }))
      .toEqual({ next: others, sources: [], sweep: false });
  });
  it('rejects a confirmation no diary asked for', () => {
    expect(() => decideConsent({ current: [], ...base, sources: ['taskDone'], pull: undefined })).toThrow(/no request/);
  });
  it('moves a consent to the account that asks now, and sweeps again', () => {
    const d = decideConsent({ current: [{ tenantId: 'bka', uid: 'uOld', sources: ['tracker'] }], ...base, sources: ['tracker'], pull: pull('tracker') });
    expect(d.next).toEqual([{ tenantId: 'bka', uid: 'uBka', sources: ['tracker'] }]);
    expect(d.sweep).toBe(true);
  });
  it('tolerates a legacy user without consents', () => {
    expect(decideConsent({ current: undefined, ...base, sources: ['tracker'], pull: pull('tracker') }).sweep).toBe(true);
  });
});

describe('consentDiaryUid', () => {
  const live = (id: string, tenant: string) => ({ id, tenants: [tenant] });
  it('names the one live user in the diary tenant', () =>
    expect(consentDiaryUid([live('me', 'scs'), live('uBka', 'bka')], 'me', 'scs', 'bka')).toBe('uBka'));
  it('names nobody with two live users in the diary tenant', () =>
    expect(consentDiaryUid([live('me', 'scs'), live('a', 'bka'), live('b', 'bka')], 'me', 'scs', 'bka')).toBeUndefined());
  it('names nobody with two live users in the source tenant', () =>
    expect(consentDiaryUid([live('me', 'scs'), live('other', 'scs'), live('uBka', 'bka')], 'me', 'scs', 'bka')).toBeUndefined());
  it('names nobody when the caller is not the live user there', () =>
    expect(consentDiaryUid([live('other', 'scs'), live('uBka', 'bka')], 'me', 'scs', 'bka')).toBeUndefined());
  it('names nobody without a diary user', () => expect(consentDiaryUid([live('me', 'scs')], 'me', 'scs', 'bka')).toBeUndefined());
});

describe('validateConsentRequest', () => {
  it('accepts a known source', () => expect(validateConsentRequest({ diaryTenantId: 'bka', sources: ['tracker'] })).toEqual({ diaryTenantId: 'bka', sources: ['tracker'] }));
  it('accepts a revocation', () => expect(validateConsentRequest({ diaryTenantId: 'bka', sources: [] }).sources).toEqual([]));
  it('rejects an unknown source', () => expect(() => validateConsentRequest({ diaryTenantId: 'bka', sources: ['nope' as never] })).toThrow(/unknown source/));
  it('rejects a missing tenant', () => expect(() => validateConsentRequest({ diaryTenantId: '', sources: [] })).toThrow(/diaryTenantId/));
  it('rejects a missing list', () => expect(() => validateConsentRequest({ diaryTenantId: 'bka' })).toThrow(/sources/));
});

import { describe, expect, it } from 'vitest';
import type { DiaryConsent, DiaryPull } from '@okr/shared-models';

import { decideConsent, validateConsentRequest } from './set-diary-consent';

const pull = (...sources: DiaryPull['sources']): DiaryPull => ({ tenantId: 'scs', sources });
const current = (...sources: DiaryConsent['sources']): DiaryConsent[] => [{ tenantId: 'bka', sources }];

describe('decideConsent', () => {
  it('stores only rows the diary asked for', () => {
    expect(decideConsent({ current: [], diaryTenantId: 'bka', sources: ['taskDone', 'tracker'], pull: pull('taskDone') }).next)
      .toEqual([{ tenantId: 'bka', sources: ['taskDone'] }]);
  });
  it('sweeps when the consent newly gains tracker', () => {
    expect(decideConsent({ current: current('taskDone'), diaryTenantId: 'bka', sources: ['taskDone', 'tracker'], pull: pull('taskDone', 'tracker') }).sweep).toBe(true);
  });
  it('sweeps once: not when tracker was allowed before', () => {
    expect(decideConsent({ current: current('tracker'), diaryTenantId: 'bka', sources: ['tracker'], pull: pull('tracker') }).sweep).toBe(false);
  });
  it('moves nothing when the pull does not ask for tracker', () => {
    const d = decideConsent({ current: [], diaryTenantId: 'bka', sources: ['tracker'], pull: pull('taskDone') });
    expect(d).toEqual({ next: [], sources: [], sweep: false });
  });
  it('revokes with an empty list, also when the diary is gone', () => {
    const others = [{ tenantId: 'jp', sources: ['taskDone' as const] }];
    expect(decideConsent({ current: [...current('tracker'), ...others], diaryTenantId: 'bka', sources: [], pull: undefined }))
      .toEqual({ next: others, sources: [], sweep: false });
  });
  it('rejects a confirmation no diary asked for', () => {
    expect(() => decideConsent({ current: [], diaryTenantId: 'bka', sources: ['taskDone'], pull: undefined })).toThrow(/no request/);
  });
  it('tolerates a legacy user without consents', () => {
    expect(decideConsent({ current: undefined, diaryTenantId: 'bka', sources: ['tracker'], pull: pull('tracker') }).sweep).toBe(true);
  });
});

describe('validateConsentRequest', () => {
  it('accepts a known source', () => expect(validateConsentRequest({ diaryTenantId: 'bka', sources: ['tracker'] })).toEqual({ diaryTenantId: 'bka', sources: ['tracker'] }));
  it('accepts a revocation', () => expect(validateConsentRequest({ diaryTenantId: 'bka', sources: [] }).sources).toEqual([]));
  it('rejects an unknown source', () => expect(() => validateConsentRequest({ diaryTenantId: 'bka', sources: ['nope' as never] })).toThrow(/unknown source/));
  it('rejects a missing tenant', () => expect(() => validateConsentRequest({ diaryTenantId: '', sources: [] })).toThrow(/diaryTenantId/));
  it('rejects a missing list', () => expect(() => validateConsentRequest({ diaryTenantId: 'bka' })).toThrow(/sources/));
});

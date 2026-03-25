import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarInfo, AvatarModelTypes, ResponsibilityModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { getResponsibilityIndex, getResponsibilityIndexInfo, getResponsibleFor, isDelegateActive, isResponsibility } from './responsibility.util';

vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
    getTodayStr: vi.fn().mockReturnValue('20260101'),
    addIndexElement: (index: string, key: string, value: string) => `${index} ${key}:${value}`.trim(),
    isValidAt: vi.fn().mockReturnValue(true),
  };
});

vi.mock('@bk2/shared-i18n', () => ({ bkTranslate: vi.fn() }));

const TENANT = 'tenant-1';
const TODAY = '20260101';

function makeAvatar(key: string, name1: string, name2: string, modelType: AvatarModelTypes, type = ''): AvatarInfo {
  return { key, name1, name2, modelType, type, subType: '', label: `${name1} ${name2}`.trim() };
}

function makeResp(overrides: Partial<ResponsibilityModel> = {}): ResponsibilityModel {
  const r = new ResponsibilityModel(TENANT);
  r.subjectAvatar = makeAvatar('sub-1', 'My', 'Club', 'org');
  r.eventType = 'president';
  r.responsibleAvatar = makeAvatar('per-1', 'Jane', 'Doe', 'person');
  r.validFrom = '20200101';
  r.validTo = '20991231';
  return Object.assign(r, overrides);
}

describe('isResponsibility', () => {
  it('calls isType with a ResponsibilityModel instance', () => {
    isResponsibility({}, TENANT);
    expect(vi.mocked(coreUtils.isType)).toHaveBeenCalledWith({}, expect.any(ResponsibilityModel));
  });
});

describe('getResponsibilityIndex', () => {
  it('returns formatted index string', () => {
    const r = makeResp();
    expect(getResponsibilityIndex(r)).toBe('sn:My Club sk:sub-1 et:president rn:Jane Doe rk:per-1');
  });

  it('handles undefined subjectAvatar', () => {
    const r = makeResp({ subjectAvatar: undefined });
    expect(getResponsibilityIndex(r)).toBe('et:president rn:Jane Doe rk:per-1');
  });

  it('handles undefined responsibleAvatar', () => {
    const r = makeResp({ responsibleAvatar: undefined });
    expect(getResponsibilityIndex(r)).toBe('sn:My Club sk:sub-1 et:president');
  });
});

describe('getResponsibilityIndexInfo', () => {
  it('returns the info string', () => {
    expect(getResponsibilityIndexInfo()).toBe('sn:subjectName sk:subjectKey et:eventType rn:responsibleName rk:responsibleKey');
  });
});

describe('isDelegateActive', () => {
  beforeEach(() => vi.mocked(coreUtils.isValidAt).mockReturnValue(true));

  it('returns false when no delegateAvatar', () => {
    const r = makeResp();
    expect(isDelegateActive(r)).toBe(false);
  });

  it('returns true when delegate is set and valid', () => {
    const r = makeResp({ delegateAvatar: makeAvatar('del-1', 'Bob', 'Smith', 'person') });
    vi.mocked(coreUtils.isValidAt).mockReturnValue(true);
    expect(isDelegateActive(r)).toBe(true);
  });

  it('returns false when delegate is set but expired', () => {
    const r = makeResp({ delegateAvatar: makeAvatar('del-1', 'Bob', 'Smith', 'person') });
    vi.mocked(coreUtils.isValidAt).mockReturnValue(false);
    expect(isDelegateActive(r)).toBe(false);
  });
});

describe('getResponsibleFor', () => {
  let responsibilities: ResponsibilityModel[];

  beforeEach(() => {
    vi.mocked(coreUtils.isValidAt).mockReturnValue(true);
    responsibilities = [makeResp()];
  });

  it('returns responsibleAvatar when no delegate', () => {
    const result = getResponsibleFor(responsibilities, 'sub-1', 'org', 'president');
    expect(result?.key).toBe('per-1');
  });

  it('returns delegateAvatar when delegate is active', () => {
    const delegate = makeAvatar('del-1', 'Bob', 'Smith', 'person');
    responsibilities = [makeResp({ delegateAvatar: delegate, delegateValidFrom: '20200101', delegateValidTo: '20991231' })];
    const result = getResponsibleFor(responsibilities, 'sub-1', 'org', 'president');
    expect(result?.key).toBe('del-1');
  });

  it('returns responsibleAvatar when delegate is expired', () => {
    const delegate = makeAvatar('del-1', 'Bob', 'Smith', 'person');
    responsibilities = [makeResp({ delegateAvatar: delegate })];
    // isValidAt returns true for the responsibility itself, false for the delegate
    vi.mocked(coreUtils.isValidAt)
      .mockReturnValueOnce(true)   // responsibility is valid
      .mockReturnValueOnce(false); // delegate is expired
    const result = getResponsibleFor(responsibilities, 'sub-1', 'org', 'president');
    expect(result?.key).toBe('per-1');
  });

  it('returns undefined when no matching responsibility', () => {
    const result = getResponsibleFor(responsibilities, 'sub-99', 'org', 'president');
    expect(result).toBeUndefined();
  });

  it('filters by eventType', () => {
    const result = getResponsibleFor(responsibilities, 'sub-1', 'org', 'treasurer');
    expect(result).toBeUndefined();
  });

  it('filters by subjectModelType', () => {
    const result = getResponsibleFor(responsibilities, 'sub-1', 'person', 'president');
    expect(result).toBeUndefined();
  });

  it('filters by scope when scope matches', () => {
    responsibilities = [makeResp({ scope: 'senior' })];
    const result = getResponsibleFor(responsibilities, 'sub-1', 'org', 'president', 'senior');
    expect(result?.key).toBe('per-1');
  });

  it('record without scope acts as wildcard', () => {
    const result = getResponsibleFor(responsibilities, 'sub-1', 'org', 'president', 'junior');
    expect(result?.key).toBe('per-1');
  });

  it('returns undefined for empty list', () => {
    expect(getResponsibleFor([], 'sub-1', 'org', 'president')).toBeUndefined();
  });
});

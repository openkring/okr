import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarInfo, AvatarModelTypes, ResponsibilityModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { getResponsibilityIndex, getResponsibilityIndexInfo, isDelegateActive, isResponsibility } from './responsibility.util';

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

function makeAvatar(key: string, name1: string, name2: string, modelType: AvatarModelTypes, type = ''): AvatarInfo {
  return { key, name1, name2, modelType, type, subType: '', label: `${name1} ${name2}`.trim() };
}

function makeResp(overrides: Partial<ResponsibilityModel> = {}): ResponsibilityModel {
  const r = new ResponsibilityModel(TENANT);
  r.bkey = 'resp-1';
  r.parentKey = 'org.sub-1';
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
    expect(getResponsibilityIndex(r)).toBe('k:resp-1 rn:Jane Doe rk:per-1');
  });

  it('handles undefined responsibleAvatar', () => {
    const r = makeResp({ responsibleAvatar: undefined });
    expect(getResponsibilityIndex(r)).toBe('k:resp-1');
  });
});

describe('getResponsibilityIndexInfo', () => {
  it('returns the info string', () => {
    expect(getResponsibilityIndexInfo()).toBe('k:key rn:responsibleName rk:responsibleKey');
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

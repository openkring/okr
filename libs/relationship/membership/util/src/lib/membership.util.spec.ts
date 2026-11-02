import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryItemModel, CategoryListModel, MembershipModel } from '@okr/shared-models';
import * as coreUtils from '@okr/shared-util-core';
import { getMembershipIndex, getMembershipIndexInfo, matchCategoryItem } from './membership.util';

// Mock shared utility functions
vi.mock('@okr/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

// Proactively mock shared-i18n to prevent Angular compiler errors.
// membership.util imports @okr/shared-util-angular, whose barrel pulls in
// country-name.pipe — that needs I18nService, so it must be on the mock too.
vi.mock('@okr/shared-i18n', () => ({
  okrTranslate: vi.fn(),
  I18nService: class {},
}));

describe('Membership Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let membership: MembershipModel;

  beforeEach(() => {
    vi.clearAllMocks();
    membership = new MembershipModel(tenantId);
    membership.okey = 'membership-1';
    membership.memberKey = 'person-1';
    membership.memberName1 = 'John';
    membership.memberName2 = 'Doe';
    membership.memberModelType = 'person';
    membership.memberType = 'male';
    membership.orgKey = 'org-1';
    membership.orgName = 'Test Club';
    membership.dateOfEntry = '20200101';
    membership.category = 'active';
    membership.price = 100;
    membership.periodicity = 'yearly';
  });

  describe('getMembershipIndex', () => {
    it('builds the index from member and org fields', () => {
      expect(getMembershipIndex(membership)).toBe('mn:John Doe mk:person-1 ok:org-1 on:Test Club');
    });

    it('appends the nickname when present', () => {
      membership.memberNickName = 'Johnny';
      expect(getMembershipIndex(membership)).toBe('mn:John Doe mk:person-1 ok:org-1 on:Test Club nn:Johnny');
    });
  });

  describe('getMembershipIndexInfo', () => {
    it('describes the index structure', () => {
      expect(getMembershipIndexInfo()).toBe('mn:memberName mk:memberKey ok:orgKey on:orgName [nn:nickName]');
    });
  });
});

describe('matchCategoryItem', () => {
  const mcat = new CategoryListModel('scs');
  mcat.name = 'mcat_scs';
  mcat.items = ['active', 'junior', 'candidate'].map(name => new CategoryItemModel(name, ''));

  it('returns the item name when the org category list has it', () => {
    expect(matchCategoryItem(mcat, 'candidate')).toBe('candidate');
  });

  it('returns undefined when the list has no such item — a category is never invented', () => {
    const generic = new CategoryListModel('test');
    generic.items = ['active', 'passive', 'junior'].map(name => new CategoryItemModel(name, ''));
    expect(matchCategoryItem(generic, 'candidate')).toBeUndefined();
  });

  it('returns undefined without a list or a proposal', () => {
    expect(matchCategoryItem(undefined, 'junior')).toBeUndefined();
    expect(matchCategoryItem(mcat, undefined)).toBeUndefined();
    expect(matchCategoryItem(mcat, '')).toBeUndefined();
  });
});

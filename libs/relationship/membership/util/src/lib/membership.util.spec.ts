import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryItemModel, CategoryListModel, GroupModel, MembershipModel, PersonModel } from '@okr/shared-models';
import * as coreUtils from '@okr/shared-util-core';
import { addPersonInfoToMembership, createGroupMembership, getMembershipIndex, getMembershipIndexInfo, getSortOrderChanges, matchCategoryItem, newMembershipForPerson, sortMembersBySortOrder } from './membership.util';

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

describe('person nickname copied into a new membership', () => {
  const person = Object.assign(new PersonModel('scs'), { okey: 'p1', firstName: 'Anna', lastName: 'Muster', nickname: 'Anni' });
  const category = { name: 'active', abbreviation: 'A' } as CategoryItemModel;

  it('copies it in addPersonInfoToMembership', () => {
    expect(addPersonInfoToMembership(new MembershipModel('scs'), person).memberNickName).toBe('Anni');
  });

  it('keeps a membership nickname when the person has none', () => {
    const membership = Object.assign(new MembershipModel('scs'), { memberNickName: 'Muschtr' });
    const plain = Object.assign(new PersonModel('scs'), { okey: 'p2' });
    expect(addPersonInfoToMembership(membership, plain).memberNickName).toBe('Muschtr');
  });

  it('copies it in newMembershipForPerson and createGroupMembership', () => {
    expect(newMembershipForPerson(person, 'scs', 'Seeclub', category).memberNickName).toBe('Anni');
    const group = Object.assign(new GroupModel('scs'), { okey: 'g1', name: 'Vorstand' });
    expect(createGroupMembership(group, person, 'scs').memberNickName).toBe('Anni');
  });
});

describe('sortMembersBySortOrder', () => {
  it('puts members with a sortOrder first, ascending, and keeps the incoming order of the rest', () => {
    const list = [
      { okey: 'a' }, { okey: 'b', sortOrder: 2 }, { okey: 'c' }, { okey: 'd', sortOrder: 1 },
    ];
    expect(sortMembersBySortOrder(list).map(m => m.okey)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('leaves the input untouched and keeps the order when nobody is sorted yet', () => {
    const list = [{ okey: 'x' }, { okey: 'y' }];
    const sorted = sortMembersBySortOrder(list);
    expect(sorted).not.toBe(list);
    expect(sorted.map(m => m.okey)).toEqual(['x', 'y']);
  });
});

describe('getSortOrderChanges', () => {
  it('returns the 1-based position of every member whose stored sortOrder differs', () => {
    const ordered = [{ okey: 'a', sortOrder: 1 }, { okey: 'c' }, { okey: 'b', sortOrder: 2 }];
    expect(getSortOrderChanges(ordered)).toEqual([{ okey: 'c', sortOrder: 2 }, { okey: 'b', sortOrder: 3 }]);
  });

  it('returns nothing when the order is already stored', () => {
    expect(getSortOrderChanges([{ okey: 'a', sortOrder: 1 }, { okey: 'b', sortOrder: 2 }])).toEqual([]);
  });
});

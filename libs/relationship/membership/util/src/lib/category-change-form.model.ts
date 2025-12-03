import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NAME } from "@bk2/shared-constants";

export type CategoryChangeFormModel = {
  bkey: string,
  memberName: string,    // firstName lastName
  orgName: string,
  dateOfChange: string,     // the first day of the new category
  membershipCategoryOld: string,
  membershipCategoryNew: string,
};

export const CATEGORY_CHANGE_FORM_SHAPE: CategoryChangeFormModel = {
  bkey: DEFAULT_KEY,
  memberName: DEFAULT_NAME,
  orgName: DEFAULT_NAME,
  dateOfChange: DEFAULT_DATE,
  membershipCategoryOld: 'active',
  membershipCategoryNew: 'active'
};
 
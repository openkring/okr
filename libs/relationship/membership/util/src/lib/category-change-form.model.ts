import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type CategoryChangeFormModel = DeepPartial<{
  bkey: string,
  memberName: string,    // firstName lastName
  orgName: string,
  dateOfChange: string,     // the first day of the new category
  membershipCategoryOld: string,
  membershipCategoryNew: string,
}>;

export const categoryChangeFormModelShape: DeepRequired<CategoryChangeFormModel> = {
  bkey: '',
  memberName: '',
  orgName: '',
  dateOfChange: '',
  membershipCategoryOld: 'active',
  membershipCategoryNew: 'active'
};
 
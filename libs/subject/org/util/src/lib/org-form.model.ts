import { OrgType } from '@bk2/shared/models';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type OrgFormModel = DeepPartial<{
  bkey: string,
  orgName: string,
  type: number,
  dateOfFoundation: string,
  dateOfLiquidation: string,
  taxId: string,
  bexioId: string,
  membershipCategoryKey: string,
  tags: string,
  notes: string
}>;

export const orgFormModelShape: DeepRequired<OrgFormModel> = {
  bkey: '',
  orgName: '',
  type: OrgType.Association,
  dateOfFoundation: '',
  dateOfLiquidation: '',
  taxId: '',
  bexioId: '',
  membershipCategoryKey: '',
  tags: '',
  notes: ''
};

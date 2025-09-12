import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { ColorIonic, RoleEnum, SectionProperties, SectionType } from '@bk2/shared-models';

export type SectionFormModel = DeepPartial<{
  bkey: string;
  name: string;
  tags: string;
  description: string;
  roleNeeded: RoleEnum;
  color: ColorIonic;
  title: string;
  subTitle: string;
  type: number;
  properties?: SectionProperties;
}>;

export const sectionFormModelShape: DeepRequired<SectionFormModel> = {
  bkey: '',
  name: '',
  tags: '',
  description: '',
  roleNeeded: RoleEnum.Privileged,
  color: ColorIonic.Primary,
  title: '',
  subTitle: '',
  type: SectionType.Article,
  properties: {},
};

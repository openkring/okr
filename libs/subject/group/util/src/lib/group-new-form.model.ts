import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { ModelType } from '@bk2/shared-models';

export type GroupNewFormModel = DeepPartial<{
  name: string,
  id: string,
  tags: string,
  notes: string,
  hasContent: boolean,
  hasChat: boolean,
  hasCalendar: boolean,
  hasTasks: boolean,
  hasFiles: boolean,
  hasAlbum: boolean,
  hasMembers: boolean,
  parentKey: string,
  parentName: string,
  parentModelType: ModelType,
}>;

export const groupNewFormModelShape: DeepRequired<GroupNewFormModel> = {
  name: '',
  id: '',
  tags: '',
  notes: '',
  hasContent: true,
  hasChat: true,
  hasCalendar: true,
  hasTasks: true,
  hasFiles: true,
  hasAlbum: true,
  hasMembers: true,
  parentKey: '',
  parentName: '',
  parentModelType: ModelType.Org
};

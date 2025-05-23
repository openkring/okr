import { ModelType } from '@bk2/shared/models';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type GroupFormModel = DeepPartial<{
  bkey: string,
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

export const groupFormModelShape: DeepRequired<GroupFormModel> = {
  bkey: '',
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

import { DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

export type GroupNewFormModel = {
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
  parentModelType: 'org' | 'group',
};

export const GROUP_NEW_FORM_SHAPE: GroupNewFormModel = {
  name: DEFAULT_NAME,
  id: DEFAULT_ID,
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES,
  hasContent: true,
  hasChat: true,
  hasCalendar: true,
  hasTasks: true,
  hasFiles: true,
  hasAlbum: true,
  hasMembers: true,
  parentKey: DEFAULT_KEY,
  parentName: DEFAULT_NAME,
  parentModelType: 'org'
};

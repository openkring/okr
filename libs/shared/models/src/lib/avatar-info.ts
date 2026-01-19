import { DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME } from '@bk2/shared-constants';

export type AvatarModelTypes = 'person' | 'org' | 'resource' | 'user' | 'group' | 'account';

export interface AvatarInfo {
  key: string; // key of the avatar
  name1: string; // firstName of the avatar
  name2: string; // lastName of the avatar or name of the org
  modelType: AvatarModelTypes; // type of the avatar
  type: string; // e.g. resource type for resource avatars
  subType: string; // e.g. rboat type for resource avatars
  label: string; // label of the avatar
}

export const AVATAR_INFO_SHAPE: AvatarInfo = {
  key: DEFAULT_KEY,
  name1: DEFAULT_NAME,
  name2: DEFAULT_NAME,
  modelType: 'person',
  type: '',
  subType: '',
  label: DEFAULT_LABEL,
};

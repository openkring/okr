import { DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME } from '@bk2/shared-constants';

export interface AvatarInfo {
  key: string; // key of the avatar
  name1: string; // firstName of the avatar
  name2: string; // lastName of the avatar or name of the org
  modelType: 'person' | 'org';
  label: string; // label of the avatar
}

export const DefaultAvatarInfo: AvatarInfo = {
  key: DEFAULT_KEY,
  name1: DEFAULT_NAME,
  name2: DEFAULT_NAME,
  modelType: 'person',
  label: DEFAULT_LABEL,
};

import { ModelType } from './enums/model-type.enum';

export interface AvatarInfo {
  key: string; // key of the avatar
  name1: string; // firstName of the avatar
  name2: string; // lastName of the avatar or name of the org
  modelType: ModelType; // Person or Org
  label: string; // label of the avatar
}

export const DefaultAvatarInfo: AvatarInfo = {
  key: '',
  name1: '',
  name2: '',
  modelType: ModelType.Person,
  label: '',
};

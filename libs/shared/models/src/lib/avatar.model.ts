import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

export class AvatarModel implements OkrModel {
  okey = DEFAULT_KEY; // key of the avatar
  tenants: string[] = DEFAULT_TENANTS;
  storagePath = '';
  isArchived = false;
}

export const AvatarDirectory = 'avatar';
export const AvatarCollection = 'avatars';
export const AvatarModelName = 'avatar';

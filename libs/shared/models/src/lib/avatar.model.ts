import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel } from './base.model';

export class AvatarModel implements BkModel {
  bkey = DEFAULT_KEY; // key of the avatar
  tenants: string[] = DEFAULT_TENANTS;
  storagePath = '';
  isArchived = false;
}

export const AvatarDirectory = 'avatar';
export const AvatarCollection = 'avatars';
export const AvatarModelName = 'avatar';

import { BkModel } from "./base.model";

export class AvatarModel implements BkModel {
  bkey = '';   // key of the avatar
  tenants: string[] = [];
  storagePath = '';
  isArchived = false;
}

export const AvatarDirectory = 'avatar';
export const AvatarCollection = 'avatars';
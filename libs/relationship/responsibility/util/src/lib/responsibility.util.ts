import { ResponsibilityModel, ResponsibilityModelName } from '@okr/shared-models';
import { addIndexElement, isType, isValidAt } from '@okr/shared-util-core';

export function isResponsibility(obj: unknown, tenantId: string): obj is ResponsibilityModel {
  return isType(obj, new ResponsibilityModel(tenantId));
}

export function getResponsibilityIndex(r: ResponsibilityModel): string {
  let index = '';
  index = addIndexElement(index, 'k', r.okey);  
  if (r.responsibleAvatar) {
    index = addIndexElement(index, 'rn', `${r.responsibleAvatar.name1} ${r.responsibleAvatar.name2}`);
    index = addIndexElement(index, 'rk', r.responsibleAvatar.key);
  }
  return index;
}

export function getResponsibilityIndexInfo(): string {
  return 'k:key rn:responsibleName rk:responsibleKey';
}

export function isDelegateActive(r: ResponsibilityModel, refDate?: string): boolean {
  if (!r.delegateAvatar) return false;
  return isValidAt(r.delegateValidFrom, r.delegateValidTo, refDate);
}



/**
 * The avatar key of a responsibility's own portrait: `responsibility.<okey>`.
 * The portrait lives in the `avatars` collection like any avatar (doc id `<tenant>.responsibility.<okey>`),
 * so ResponsibilityModel needs no field for it.
 */
export function getResponsibilityPortraitKey(okey: string): string {
  return okey ? `${ResponsibilityModelName}.${okey}` : '';
}

/**
 * The avatar key to show for a responsibility: its own portrait when one exists, else the avatar of
 * the responsible person/group (`<modelType>.<key>`), else ''.
 * @param r the responsibility
 * @param hasAvatar tells whether an avatar exists for a key (e.g. AvatarService.getCachedStoragePath)
 */
export function getResponsibilityImageKey(r: Pick<ResponsibilityModel, 'okey' | 'responsibleAvatar'> | undefined, hasAvatar: (key: string) => boolean): string {
  if (!r) return '';
  const portraitKey = getResponsibilityPortraitKey(r.okey);
  if (portraitKey && hasAvatar(portraitKey)) return portraitKey;
  const avatar = r.responsibleAvatar;
  return avatar?.key ? `${avatar.modelType}.${avatar.key}` : '';
}

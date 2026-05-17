export function getSvgIconUrl(imgixBaseUrl: string, iconName: string, dir = 'icons'): string {
  if (iconName.length === 0) return '';
  return `${imgixBaseUrl}/logo/${dir}/${iconName}.svg`;
}

export function getIconColor(isValidated: boolean): string {
  return (isValidated ? 'gold' : '#009D53');
}

// 20.rboat:key for a rowing boat, 20.locker:key for a locker
// 20.rboat_b1x:key for a skiff -> ModelType.ResourceType_SubType:key
export function getAvatarKey(modelType: string, key: string, resourceType?:string, subType?: string): string {
  if (modelType === 'resource' && resourceType !== undefined) {
    if (resourceType === 'rboat' && subType !== undefined) {
      return `${modelType}.${resourceType}_${subType}:${key}`;
    } else {
      return `${modelType}.${resourceType}:${key}`;
    }
  } else {
    return `${modelType}.${key}`;
  }
}
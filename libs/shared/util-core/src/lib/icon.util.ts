/**
 * Icons bundled with a feature as data URLs, by name (default set `icons` only). A feature that must render
 * offline registers the few icons it needs (e.g. the travel journal, spec 1.126), so they never depend on the
 * imgix HTTP cache; every other icon still loads from the icon repository.
 */
const bundledIcons = new Map<string, string>();

export function registerBundledIcons(icons: Record<string, string>): void {
  for (const [name, dataUrl] of Object.entries(icons)) bundledIcons.set(name, dataUrl);
}

export function getSvgIconUrl(imgixBaseUrl: string, iconName: string, dir = 'icons'): string {
  if (iconName.length === 0) return '';
  if (dir === 'icons') {
    const bundled = bundledIcons.get(iconName);
    if (bundled) return bundled;
  }
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
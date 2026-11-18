/**
 * Icons bundled with a feature as data URLs. A feature that must render offline registers the few icons it needs
 * (e.g. the travel journal, spec 1.126), so they never depend on the imgix HTTP cache; every other icon still loads
 * from the icon repository. Keyed by name for the default set `icons`, by `<set>/<name>` for any other set
 * (e.g. `section/hero`, the section-type pictures of the card-select modal).
 */
const bundledIcons = new Map<string, string>();

export function registerBundledIcons(icons: Record<string, string>): void {
  for (const [name, dataUrl] of Object.entries(icons)) bundledIcons.set(name, dataUrl);
}

/** The default icon set: its names are stored without a prefix. */
export const DEFAULT_ICON_SET = 'icons';

/**
 * An icon name as it is stored: bare for the default set (`download`), `<set>:<name>` for any other set
 * (`filetypes:pdf`, `weather:sun`). This is what the icon selector returns, so an icon from any set can be stored.
 */
export function qualifyIconName(name: string, set = DEFAULT_ICON_SET): string {
  if (!name || name.includes(':') || !set || set === DEFAULT_ICON_SET) return name;
  return `${set}:${name}`;
}

/** The set and the bare name of a stored icon name (`filetypes:pdf` → filetypes / pdf, `download` → icons / download). */
export function splitIconName(iconName: string): { set: string; name: string } {
  const i = iconName.indexOf(':');
  if (i <= 0 || i === iconName.length - 1) return { set: DEFAULT_ICON_SET, name: iconName };
  return { set: iconName.slice(0, i), name: iconName.slice(i + 1) };
}

export function getSvgIconUrl(imgixBaseUrl: string, iconName: string, dir = DEFAULT_ICON_SET): string {
  if (iconName.length === 0) return '';
  // a qualified name (`filetypes:pdf`) carries its own set
  if (dir === DEFAULT_ICON_SET && iconName.includes(':')) ({ set: dir, name: iconName } = splitIconName(iconName));
  const bundled = bundledIcons.get(dir === 'icons' ? iconName : `${dir}/${iconName}`);
  if (bundled) return bundled;
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
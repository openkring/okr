import { AVATAR_CONFIG_SHAPE, AvatarConfig, NameDisplay, PEOPLE_NAME_PLACEHOLDER, PeopleConfig } from '@okr/shared-models';

/** A colour accepted for a portrait background: #rrggbb. */
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
/** A border radius: a pixel value ('12', '12px') or a percentage ('50%' = circle). */
export const IMG_RADIUS_REGEX = /^(\d{1,3}(px)?|\d{1,2}%)$/;
export const PEOPLE_MAX_BG_COLORS = 4;

/**
 * Fills the gaps of a stored people config with the defaults and maps the two retired flags
 * of sections saved before 2026-11-10: `showName: false` → nameDisplay None, `showLabel` → info 'function'.
 * Firestore reads skip model defaults, so every field may be missing on a legacy doc.
 */
export function normalizeAvatarConfig(stored?: Partial<AvatarConfig>): AvatarConfig {
  const defined = Object.fromEntries(
    Object.entries(stored ?? {}).filter(([, value]) => value !== undefined && value !== null)
  ) as Partial<AvatarConfig>;
  const config: AvatarConfig = { ...AVATAR_CONFIG_SHAPE, ...defined };
  if (defined.nameDisplay === undefined && stored?.showName === false) {
    config.nameDisplay = NameDisplay.None;
  }
  if (defined.info === undefined && stored) {
    config.info = stored.showLabel === true ? ['function'] : [];
  }
  return config;
}

/** The alt text of one portrait: every @NAME@ becomes the person's full name. */
export function getPeopleAltText(altText: string | undefined, fullName: string): string {
  const text = altText?.trim() || AVATAR_CONFIG_SHAPE.altText;
  return text.split(PEOPLE_NAME_PLACEHOLDER).join(fullName).trim();
}

/** A border radius as CSS: a bare number is read as px. */
export function getPeopleImgRadius(radius: string | undefined): string {
  const value = (radius ?? '').trim();
  if (!IMG_RADIUS_REGEX.test(value)) return AVATAR_CONFIG_SHAPE.imgRadius;
  return /^\d+$/.test(value) ? `${value}px` : value;
}

/**
 * The responsibilities of a people section, in the order they were chosen. Sections saved before
 * 2026-11-13 carry a single `responsibilityId`; it is read as a list of one.
 */
export function getPeopleResponsibilityIds(config?: Partial<PeopleConfig>): string[] {
  const ids = (config?.responsibilityIds ?? []).filter(id => !!id?.trim());
  if (ids.length > 0) return ids;
  const legacy = config?.responsibilityId?.trim();
  return legacy ? [legacy] : [];
}

/**
 * The background colour of the person at `index`, as #rrggbb, or undefined when the
 * background is not filled. `orgColorHex` is the tenant colour resolved by the caller;
 * for bgOrgColor = alternating it is the list [primary, secondary], cycled over the persons.
 */
export function getPeopleBgColor(config: AvatarConfig, index: number, orgColorHex?: string | string[]): string | undefined {
  switch (config.background) {
    case 'orgColor': {
      const colors = (Array.isArray(orgColorHex) ? orgColorHex : [orgColorHex ?? '']).filter(c => HEX_COLOR_REGEX.test(c));
      return colors.length > 0 ? colors[index % colors.length] : undefined;
    }
    case 'colors': {
      const colors = (config.bgColors ?? []).filter(c => HEX_COLOR_REGEX.test(c));
      return colors.length > 0 ? colors[index % colors.length] : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The imgix query (without '?') for one portrait of a people section:
 * size at 2x density, face crop (facearea + facepad, or crop=faces when facePad is 0),
 * optional black and white, optional background removal with a fill colour.
 * Black and white with a removed background greys only the person: imgix would desaturate its own
 * `bg` fill too, so the fill is left out and the caller paints `bgColor` behind the transparent cut-out.
 */
export function getPeopleImgixParams(config: AvatarConfig, bgColor?: string): string {
  const params = [
    `w=${Math.round(config.imgWidth)}`,
    `h=${Math.round(config.imgHeight)}`,
    'dpr=2',
    'auto=format,compress',
  ];
  if (config.facePad > 0) {
    params.push('fit=facearea', `facepad=${config.facePad}`);
  } else {
    params.push('fit=crop', 'crop=faces');
  }
  if (config.grayscale) params.push('sat=-100');
  if (config.background !== 'original') {
    params.push('bg-remove=true');
    if (!config.grayscale && bgColor && HEX_COLOR_REGEX.test(bgColor)) params.push(`bg=${bgColor.slice(1).toUpperCase()}`);
  }
  return params.join('&');
}

/** Distributes the persons round-robin over `rows` slider lines (1–4), keeping their order per line. */
export function splitIntoRows<T>(items: T[], rows: number): T[][] {
  const count = Math.min(Math.max(Math.round(rows) || 1, 1), 4);
  const lines: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, i) => lines[i % count].push(item));
  return lines.filter(line => line.length > 0);
}

/** A CSS colour (rgb(), #rgb, #rrggbb) as #rrggbb, or undefined when it cannot be parsed. */
export function toHexColor(css: string | undefined): string | undefined {
  const value = (css ?? '').trim();
  if (HEX_COLOR_REGEX.test(value)) return value.toLowerCase();
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(value);
  if (rgb) return '#' + rgb.slice(1, 4).map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
  return undefined;
}

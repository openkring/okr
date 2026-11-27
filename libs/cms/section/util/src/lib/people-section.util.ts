import { AVATAR_CONFIG_SHAPE, AvatarConfig, NameDisplay, PEOPLE_NAME_PLACEHOLDER, PEOPLE_SIZE_PX, PeopleConfig, PeopleLook } from '@okr/shared-models';

/** A colour accepted for a portrait background: #rrggbb. */
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

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

/** The parent ('group.<okey>') whose responsibilities a people section shows after the chosen ones, or ''. */
export function getPeopleResponsibilityParentKey(config?: Partial<PeopleConfig>): string {
  const key = config?.responsibilityParentKey?.trim() ?? '';
  return key && !key.includes('/') ? key : '';
}

/** The fields of a responsibility that decide whether and where it is listed under its parent. */
export interface ParentRoleCandidate {
  okey?: string;
  name?: string;
  parentKey?: string;
  isArchived?: boolean;
  validFrom?: string;
  validTo?: string;
  responsibleAvatar?: { name1?: string; name2?: string } | null;
}

/**
 * The keys of the responsibilities listed under `parentKey`: same parent, not archived and valid on `today`
 * (StoreDate yyyyMMdd; an empty validFrom / validTo is open), ordered by name, then the responsible's last
 * and first name. Mirrored for the website by `rolesUnderParent` in `@okr/cms-website-render`.
 */
export function getResponsibilityKeysUnderParent(candidates: ParentRoleCandidate[], parentKey: string, today: string): string[] {
  if (!parentKey) return [];
  const sortName = (r: ParentRoleCandidate) =>
    [r.name ?? '', r.responsibleAvatar?.name2 ?? '', r.responsibleAvatar?.name1 ?? ''].map(s => s.trim().toLocaleLowerCase('de'));
  return candidates
    .filter(r => !!r.okey && r.parentKey === parentKey && r.isArchived !== true)
    .filter(r => (!r.validFrom || r.validFrom <= today) && (!r.validTo || r.validTo >= today))
    .sort((a, b) => {
      const [x, y] = [sortName(a), sortName(b)];
      for (let i = 0; i < x.length; i++) {
        const diff = x[i].localeCompare(y[i], 'de');
        if (diff !== 0) return diff;
      }
      return 0;
    })
    .map(r => r.okey as string);
}

/** The chosen responsibilities first (in their order), then those under the parent; each once. */
export function mergeResponsibilityKeys(chosen: string[], underParent: string[]): string[] {
  return [...new Set([...chosen, ...underParent])];
}

/**
 * The background colour of the person at `index`, as #rrggbb, or undefined when the portrait keeps its own
 * background. `orgColorHex` is resolved by the caller: 'primary' uses the first valid colour, 'alternating'
 * cycles the list over the persons.
 */
export function getPeopleBgColor(look: PeopleLook, index: number, orgColorHex?: string | string[]): string | undefined {
  if (look.fill === 'original') return undefined;
  const colors = (Array.isArray(orgColorHex) ? orgColorHex : [orgColorHex ?? '']).filter(c => HEX_COLOR_REGEX.test(c));
  if (colors.length === 0) return undefined;
  return look.fill === 'primary' ? colors[0] : colors[index % colors.length];
}

/**
 * The imgix query (without '?') for one portrait of a people section: a square of the look's size at 2x
 * density, face crop, optional black and white, optional background removal (any fill but 'original').
 * Black and white with a removed background greys only the person: imgix would desaturate its own
 * `bg` fill too, so the fill is left out and the caller paints `bgColor` behind the transparent cut-out.
 */
export function getPeopleImgixParams(look: PeopleLook, bgColor?: string): string {
  const px = PEOPLE_SIZE_PX[look.size];
  const params = [`w=${px}`, `h=${px}`, 'dpr=2', 'auto=format,compress', 'fit=crop', 'crop=faces'];
  if (look.grayscale) params.push('sat=-100');
  if (look.fill !== 'original') {
    params.push('bg-remove=true');
    if (!look.grayscale && bgColor && HEX_COLOR_REGEX.test(bgColor)) params.push(`bg=${bgColor.slice(1).toUpperCase()}`);
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

import { NameDisplay } from './enums/name-display.enum';
import { resolvePeopleLook } from './people-look';
import type { PeopleConfig } from './section.model';

function validKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  const seen = new Set<string>();
  for (const k of keys) if (typeof k === 'string' && k !== '') seen.add(k);
  return [...seen];
}

/** Keys of persons the section does not show: `hiddenKeys`, and for type 'group' the stale `excludedPersons` too. */
export function peopleHiddenKeys(config?: Partial<PeopleConfig>): string[] {
  if (!config) return [];
  const keys = validKeys(config.hiddenKeys);
  if (config.type === 'group') {
    for (const k of validKeys((config.excludedPersons ?? []).map((p) => p?.key))) if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** Applies the hidden keys and the wanted order (not for type 'persons', whose order is the array). Never mutates. */
export function applyPeopleOverrides<T extends { key: string }>(
  persons: readonly T[],
  config?: Partial<PeopleConfig>,
  options?: { keepHidden?: boolean },
): T[] {
  const hidden = new Set(peopleHiddenKeys(config));
  const visible = options?.keepHidden ? [...persons] : persons.filter((p) => !hidden.has(p.key));
  if (!config || config.type === 'persons') return visible;
  const byKey = new Map<string, T>();
  for (const p of visible) if (!byKey.has(p.key)) byKey.set(p.key, p);
  const ordered: T[] = [];
  const used = new Set<string>();
  for (const k of validKeys(config.orderKeys)) {
    const p = byKey.get(k);
    if (p && !used.has(k)) {
      ordered.push(p);
      used.add(k);
    }
  }
  for (const p of visible) if (!used.has(p.key)) ordered.push(p);
  return ordered;
}

const OLD_LOOK_FIELDS = [
  'imgWidth', 'imgHeight', 'imgRadius', 'facePad', 'background', 'bgOrgColor', 'bgColors', 'color',
  'perRow', 'sliderRows', 'infoPosition', 'showName', 'showLabel',
] as const;

/** The config to save: drops fields of other sources, the old look fields and stale overrides. Never mutates. */
export function cleanPeopleConfig(config: PeopleConfig, shownKeys: readonly string[]): PeopleConfig {
  const shown = new Set(shownKeys);
  const out: PeopleConfig = { ...config };
  const avatar: Record<string, unknown> = { ...config.avatar };
  // the retired flags are folded as normalizeAvatarConfig reads them, before they are dropped: the drawing stays the same
  if (config.avatar) {
    const { showName, showLabel, nameDisplay, info } = config.avatar;
    if ((nameDisplay === undefined || nameDisplay === null) && showName === false) avatar['nameDisplay'] = NameDisplay.None;
    if (info === undefined || info === null) avatar['info'] = showLabel === true ? ['function'] : [];
  }
  for (const f of OLD_LOOK_FIELDS) delete avatar[f];
  const look = resolvePeopleLook(config.avatar);
  avatar['size'] = look.size;
  avatar['shape'] = look.shape;
  avatar['fill'] = look.fill;
  avatar['textPosition'] = look.textPosition;
  out.avatar = avatar as unknown as PeopleConfig['avatar'];

  if (config.type !== 'persons') out.persons = [];
  if (config.type !== 'group') {
    delete out.groupId;
  }
  if (config.type !== 'responsibility') {
    delete out.responsibilityIds;
    delete out.responsibilityId;
    delete out.responsibilityParentKey;
    delete out.responsibilityParentName;
  }
  const hidden = peopleHiddenKeys(config).filter((k) => shown.has(k));
  delete out.excludedPersons;
  if (hidden.length) out.hiddenKeys = hidden;
  else delete out.hiddenKeys;
  const order = config.type === 'persons' ? [] : validKeys(config.orderKeys).filter((k) => shown.has(k));
  if (order.length) out.orderKeys = order;
  else delete out.orderKeys;
  return out;
}

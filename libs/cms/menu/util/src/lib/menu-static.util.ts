import {
  DEFAULT_STATIC_BULLET_SIZE,
  MAX_STATIC_BULLET_SIZE,
  MAX_STATIC_MENU_ITEMS,
  MAX_STATIC_SUB_ITEMS,
  MIN_STATIC_BULLET_SIZE,
} from '@okr/shared-constants';
import {
  MenuItemModel,
  MenuType,
  StaticMenuActiveStyle,
  StaticMenuBulletShape,
  StaticMenuChildrenDirection,
  StaticMenuChildrenVisibility,
  StaticMenuConfig,
} from '@okr/shared-models';

import { isMenuBlocked } from './menu-cycle.util';
import { visibleBarRows } from './menu-bar.util';

/** The Ionic colour names a static bullet may use. */
export const STATIC_MENU_COLORS: readonly string[] = ['primary', 'secondary', 'tertiary', 'success', 'warning', 'danger', 'light', 'medium', 'dark'];

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BULLET_SHAPES: readonly StaticMenuBulletShape[] = ['square', 'round', 'none'];
const ACTIVE_STYLES: readonly StaticMenuActiveStyle[] = ['bold', 'color', 'underline'];
const CHILDREN_VISIBILITIES: readonly StaticMenuChildrenVisibility[] = ['always', 'active'];
const CHILDREN_DIRECTIONS: readonly StaticMenuChildrenDirection[] = ['horizontal', 'vertical'];

/** Whether the value is an Ionic colour name from {@link STATIC_MENU_COLORS} or a #rgb / #rrggbb hex. */
export function isStaticBulletColor(value: string): boolean {
  return STATIC_MENU_COLORS.includes(value) || HEX_COLOR.test(value);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** The static menu look of a root with every field filled; an invalid value falls back to its default. */
export function resolveStaticMenu(root: Pick<MenuItemModel, 'staticMenu'> | undefined): Required<StaticMenuConfig> {
  const c = root?.staticMenu ?? {};
  const size = c.bulletSize;
  return {
    bulletColor: typeof c.bulletColor === 'string' && isStaticBulletColor(c.bulletColor) ? c.bulletColor : 'primary',
    bulletShape: pick(c.bulletShape, BULLET_SHAPES, 'square'),
    bulletSize:
      typeof size === 'number' && Number.isInteger(size) && size >= MIN_STATIC_BULLET_SIZE && size <= MAX_STATIC_BULLET_SIZE
        ? size
        : DEFAULT_STATIC_BULLET_SIZE,
    activeStyle: pick(c.activeStyle, ACTIVE_STYLES, 'bold'),
    childrenVisibility: pick(c.childrenVisibility, CHILDREN_VISIBILITIES, 'active'),
    childrenDirection: pick(c.childrenDirection, CHILDREN_DIRECTIONS, 'horizontal'),
  };
}

/** A CSS colour for a bullet: a name becomes its Ionic variable, a hex stays as it is. */
export function staticBulletColorCss(color: string): string {
  return STATIC_MENU_COLORS.includes(color) ? `var(--ion-color-${color})` : color;
}

/** Whether the static block renders the main menu: `static` on a wide screen. */
export function isStaticActive(type: MenuType | undefined, isWide: boolean): boolean {
  return type === 'static' && isWide;
}

export interface StaticMenuRow {
  item: MenuItemModel;
  children: MenuItemModel[];
}

export interface StaticMenuRows {
  rows: StaticMenuRow[];
  /** Names of rows and children that do not fit the static limits (spec 1.163 §6.6). */
  cut: string[];
}

/** Rows and children the static menu can draw, within its limits; what does not fit is named in `cut`. */
export function buildStaticRows(
  rootItems: string[],
  items: MenuItemModel[],
  canSee: (item: MenuItemModel) => boolean,
  rootName = '',
): StaticMenuRows {
  const byName = new Map(items.map(item => [item.name, item]));
  const cut: string[] = [];
  const candidates: StaticMenuRow[] = [];

  for (const item of visibleBarRows(rootItems, items, canSee)) {
    if (item.action === 'divider' || item.action === 'navigate' || item.action === 'browse') {
      candidates.push({ item, children: [] });
      continue;
    }
    if (item.action !== 'sub') continue;

    const visited = new Set([rootName, item.name].filter(n => n !== ''));
    const kids = (item.menuItems ?? [])
      .map(name => byName.get(name))
      .filter((c): c is MenuItemModel => !!c && canSee(c) && c.action !== 'divider' && !isMenuBlocked(visited, c.name, 0));
    const children: MenuItemModel[] = [];
    for (const kid of kids) {
      if (kid.action === 'sub') cut.push(kid.name);
      else if (kid.action !== 'navigate' && kid.action !== 'browse') continue;
      else if (children.length >= MAX_STATIC_SUB_ITEMS) cut.push(kid.name);
      else children.push(kid);
    }
    if (children.length > 0) candidates.push({ item, children });
  }

  const rows: StaticMenuRow[] = [];
  let counted = 0;
  for (const row of candidates) {
    if (row.item.action === 'divider') {
      if (rows.length > 0 && rows[rows.length - 1].item.action !== 'divider') rows.push(row);
      continue;
    }
    if (counted >= MAX_STATIC_MENU_ITEMS) {
      cut.push(row.item.name);
      continue;
    }
    counted++;
    rows.push(row);
  }
  while (rows.length > 0 && rows[rows.length - 1].item.action === 'divider') rows.pop();
  return { rows, cut };
}

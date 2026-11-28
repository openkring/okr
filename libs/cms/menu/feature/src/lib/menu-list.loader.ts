import type { Type } from '@angular/core';

import type { MenuList } from './menu-list';

/**
 * The menu list (route `menu/all`), loaded lazily (lazy-loading skill, rule 3). The menu shell imports this barrel
 * statically, so `import('@okr/cms-menu-feature')` would keep the list in the start bundle.
 */
export async function loadMenuList(): Promise<Type<MenuList>> {
  return (await import('./menu-list')).MenuList;
}

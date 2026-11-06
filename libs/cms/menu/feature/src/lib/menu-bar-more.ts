import { Component, computed, inject, input } from '@angular/core';

import { MenuItemModel } from '@okr/shared-models';

import { nextVisitedKeys } from '@okr/cms-menu-util';

import { Menu } from './menu';
import { MenuItemsStore } from './menu-items.store';

/**
 * The rows under «Mehr» in the menu bar: the visible rows beyond what the bar can show
 * (`splitBarRows`, menu-layouts spec §6.5).
 *
 * Each row sits behind its own `canOpen()`, as in `MenuBarAccount`, and for the same reason it is a
 * component of its own: `MenuBar` holds the popover, and `check-context-menus` demands a `canOpen`
 * guard around any popover whose template renders `<okr-menu>`. Here the guard is per row, inside this
 * component, so `MenuBar` never renders an `okr-menu` itself. The selector is `okr-bar-more` and not
 * `okr-menu-bar-more` because the rule's regex `<okr-menu\b` would match the latter.
 *
 * Every row is a level-1 menu under the root, so it starts at depth 1 with the root on its visited
 * path, the same start `MenuBarItem` gives its children. `sub` rows then open as the accordion.
 */
@Component({
  selector: 'okr-bar-more',
  imports: [Menu],
  template: `
    @for (row of rows(); track row.name) {
      @if (menuItemsStore.canOpen(row.name)) {
        <okr-menu [menuName]="row.name" [inMainTree]="true" [inputDepth]="1" [inputVisitedKeys]="visitedKeys()" />
      }
    }
  `,
})
export class MenuBarMore {
  protected readonly menuItemsStore = inject(MenuItemsStore);

  public readonly rows = input.required<MenuItemModel[]>();
  /** `name` of the root menu document (`main_<tenantId>`), the first key on the path. */
  public readonly rootName = input.required<string>();

  protected readonly visitedKeys = computed(() => nextVisitedKeys(new Set<string>(), this.rootName()));
}

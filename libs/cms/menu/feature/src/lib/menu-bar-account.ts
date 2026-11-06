import { Component, computed, inject, input } from '@angular/core';

import { barAccountKeys } from '@okr/cms-menu-util';

import { Menu } from './menu';
import { MenuItemsStore } from './menu-items.store';

/**
 * The reserved rows of the root menu (login, logout, profile) inside the dropdown of the menu bar.
 *
 * Each row sits behind its own `canOpen()`: the menu document decides, and a row whose `roleNeeded`
 * the person does not meet leaves no gap. The «…» button itself is not gated, because the
 * Cookie-Einstellungen entry below these rows has to stay reachable. It is a component of its own
 * so that `MenuBar`, which holds the popover, never renders an `okr-menu` without that guard.
 * The selector is `okr-bar-account`, not `okr-menu-bar-account`, because the `check-context-menus`
 * regex `<okr-menu\b` would match the latter and demand a `canOpen` guard around the popover.
 */
@Component({
  selector: 'okr-bar-account',
  imports: [Menu],
  template: `
    @for (key of keys(); track key) {
      @if (menuItemsStore.canOpen(key)) {
        <okr-menu [menuName]="key" />
      }
    }
  `,
})
export class MenuBarAccount {
  protected readonly menuItemsStore = inject(MenuItemsStore);

  /** The stored rows of the root document `main_<tenantId>`; the reserved ones are picked from them. */
  public readonly rootItems = input<string[] | undefined>();

  protected readonly keys = computed(() => barAccountKeys(this.rootItems()));
}

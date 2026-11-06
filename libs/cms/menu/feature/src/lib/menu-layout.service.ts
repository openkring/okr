import { computed, effect, inject, Injectable, Injector, PLATFORM_ID, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { AppStore } from '@okr/shared-feature';
import { MenuType } from '@okr/shared-models';
import { DEFAULT_SUBMENU_OFFSET } from '@okr/shared-constants';
import { persistedSignal } from '@okr/shared-util-angular';

import { isBarActive } from '@okr/cms-menu-util';

import { MenuItemsStore } from './menu-items.store';

/** Ionic's `lg` breakpoint: where the split pane shows the menu and where a `top` bar has room. */
export const MENU_WIDE_QUERY = '(min-width: 992px)';

/** The outlet's `top` while the bar is shown: the bar's height plus the notch it owns. */
const BAR_TOP = 'calc(56px + var(--ion-safe-area-top, 0px))';

/**
 * How the main menu of this tenant is laid out (menu-layouts spec §5, §6.1), for the shell.
 *
 * `MenuLayout` must NOT inject `MenuItemsStore` in a field or constructor, directly or through
 * anything that does: that store opens the tenant-wide `menuItems` query, which on a phone is
 * deliberately kept off the boot path (perf-baselines.md). The shell injects this class at boot
 * and calls {@link start} once the menu tree is mounted and the session is ready; `Injector.get`
 * there is the only place the store is reached.
 *
 * Until the root document has arrived, the last type seen on this device stands in for it, so a
 * tenant with a bar does not flash a sidebar first.
 */
@Injectable({ providedIn: 'root' })
export class MenuLayout {
  private readonly injector = inject(Injector);
  private readonly appStore = inject(AppStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Set by {@link start}; undefined until the shell has mounted the menu. */
  private readonly menuItemsStore = signal<MenuItemsStore | undefined>(undefined);

  /**
   * The last layout type seen for this tenant. Keyed by the tenant of the deployment: AppStore sets
   * `tenantId` from the environment in its `onInit`, so it is final by the time this service exists.
   * Constructed once here, as `persistedSignal` requires.
   */
  private readonly hint = persistedSignal<MenuType>(`okr.menuType.${this.appStore.tenantId()}`, 'left');

  /** The root document `main_<tenantId>`; undefined until the list has delivered a value. */
  private readonly root = computed(() => {
    const name = `main_${this.appStore.tenantId()}`;
    return this.menuItemsStore()?.menuItems()?.find(item => item.name === name);
  });

  private readonly isWide = signal(this.isBrowser && typeof window.matchMedia === 'function' ? window.matchMedia(MENU_WIDE_QUERY).matches : false);

  /** The layout type: the live root document once it is there, else the per-device hint. */
  public readonly menuType = computed<MenuType>(() => {
    const root = this.root();
    return root ? (root.menuType ?? 'left') : this.hint();
  });
  /** `end` for `right`, otherwise `start`. */
  public readonly side = computed<'start' | 'end'>(() => this.menuType() === 'right' ? 'end' : 'start');
  /** Whether the menu bar replaces the sidebar on the current width. */
  public readonly barActive = computed(() => isBarActive(this.menuType(), this.isWide()));
  /** Indent of submenu rows and gap below a dropdown, in px. */
  public readonly submenuOffset = computed(() => this.root()?.submenuOffset ?? DEFAULT_SUBMENU_OFFSET);
  /** Value for the outlet's `top` while the bar is shown; null while there is no bar. */
  public readonly barTop = computed<string | null>(() => this.barActive() ? BAR_TOP : null);

  constructor() {
    if (this.isBrowser && typeof window.matchMedia === 'function') {
      // The service lives as long as the app, so the listener is never removed.
      window.matchMedia(MENU_WIDE_QUERY).addEventListener('change', event => this.isWide.set(event.matches));
    }
    // Only a real document value updates the hint: while the list loads, root() is undefined and
    // the hint must keep what the last visit stored, not be overwritten with the `left` default.
    effect(() => {
      const root = this.root();
      if (root) this.hint.set(root.menuType ?? 'left');
    });
  }

  /** Connects to the menu list. Idempotent; the shell calls it once the menu tree is mounted. */
  public start(): void {
    if (untracked(this.menuItemsStore)) return;
    // Creating the store builds a resource, which must not happen inside a caller's reactive context.
    untracked(() => this.menuItemsStore.set(this.injector.get(MenuItemsStore)));
  }
}

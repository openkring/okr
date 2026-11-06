import { Component, computed, effect, inject, output } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPopover, IonSegment, IonSegmentButton, IonToolbar } from '@ionic/angular';

import { MenuItemModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AvatarUser, ConnectionStatusButton } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { contextMenuId, hasRole } from '@okr/shared-util-core';

import { splitBarRows, visibleBarRows } from '@okr/cms-menu-util';

import { MenuBarAccount } from './menu-bar-account';
import { MenuBarItem } from './menu-bar-item';
import { MenuBarLabel } from './menu-bar-label';
import { MenuBarMore } from './menu-bar-more';
import { MenuItemsStore } from './menu-items.store';
import { MenuLayout } from './menu-layout.service';
import { MenuStore } from './menu.store';

/**
 * The main menu as a bar across the top of the shell (menu-layouts spec §6, §8). The shell renders
 * one instance, inside `#main` above the router outlet, while `MenuLayout.barActive()` is true.
 *
 * `segmented` and `top` are both drawn here (`top` through `MenuBarItem`). The end of the
 * toolbar is the account area (spec §6.4): the connection status, the projection slot
 * `[okrMenuBarEnd]` (the shell puts the tenant switcher and the debug info there), the avatar, and a
 * «…» button whose popover holds login, logout and profile plus Cookie-Einstellungen. That popover is
 * a dropdown (`okr-menu-dropdown`, see `Menu.select`) and has no `dismissOnSelect`, which Ionic
 * puts on the whole wrapper: it would close on every click inside, an accordion header included.
 *
 * With more than `MAX_MENU_BAR_ITEMS` visible rows the bar shows five and a «Mehr» button after them, in
 * both layouts. It is a plain button, not a segment button, and opens a dropdown of the same kind as
 * the account one, with one `okr-menu` per remaining row (`MenuBarMore`).
 *
 * The segment follows the accounting segments (`okr-accounting-segments`), including both of its
 * lessons. Each button navigates on its own click, not on `ionChange`: a cached page's segment can
 * already hold the tapped value, and the tap would then do nothing. And the segment is re-created
 * whenever the active row changes instead of being given a new value, because Ionic animates the
 * marker from the old button by measuring buttons that are hidden, and the marker stayed behind.
 *
 * Absolutely positioned at the top of `#main`, with the safe area inside its own height: the outlet
 * is offset by the same amount and zeroes `--ion-safe-area-top` for its pages (`MenuLayout.barTop`).
 */
@Component({
  selector: 'okr-menu-bar',
  imports: [
    MenuBarAccount, MenuBarItem, MenuBarLabel, MenuBarMore, SvgIconPipe, AvatarUser, ConnectionStatusButton,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonPopover, IonContent, IonList, IonSegment, IonSegmentButton, IonLabel, IonItem,
  ],
  providers: [MenuStore],
  styles: [`
    :host {
      position: absolute;
      top: 0;
      inset-inline: 0;
      z-index: 2;
      display: block;
      height: calc(56px + var(--ion-safe-area-top, 0px));
    }
    ion-toolbar { --min-height: 56px; }
    .bar { display: flex; align-items: center; min-width: 0; }
    ion-segment { flex: 1 1 auto; min-width: 0; }
    ion-item.warn { flex: 0 1 auto; font-size: 13px; }
    /* «Mehr» sits in the toolbar but not in its ion-buttons, so it takes the colour itself, like MenuBarItem */
    ion-button.more {
      --color: var(--ion-color-secondary-contrast);
      --background-hover: var(--ion-color-secondary-contrast);
      --background-hover-opacity: 0.16;
      flex: 0 0 auto;
      height: auto;
      min-height: 40px;
      text-transform: none;
    }
    ion-button.more.current::part(native) { box-shadow: inset 0 -2px 0 var(--ion-color-secondary-contrast); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <div class="bar">
          @if (layout.menuType() === 'segmented') {
            @if (segmentRows().length > 0) {
              @for (activeKey of [activeKey()]; track activeKey) {
                <ion-segment [scrollable]="true" [value]="activeKey">
                  @for (row of segmentRows(); track row.name) {
                    <ion-segment-button [value]="row.name" (click)="select(row)">
                      <ion-label><okr-menu-bar-label [name]="row.name" /></ion-label>
                    </ion-segment-button>
                  }
                </ion-segment>
              }
            }
            @if (isAdmin() && subRows().length > 0) {
              <ion-item color="warning" lines="none" class="warn">
                <ion-label>{{ store.i18n.bar_segment_sub() }}: {{ subNames() }}</ion-label>
              </ion-item>
            }
          }
          @if (layout.menuType() === 'top') {
            @for (row of shownRows(); track row.name) {
              <okr-menu-bar-item [name]="row.name" />
            }
          }
          @if (moreRows().length > 0) {
            <ion-button id="{{ moreId }}" class="more" fill="clear" [class.current]="moreOnPath()" aria-haspopup="true">
              {{ store.i18n.bar_more() }}
              <ion-icon slot="end" src="{{ 'chevron-down' | svgIcon }}" />
            </ion-button>
            <ion-popover class="okr-menu-dropdown" trigger="{{ moreId }}" triggerAction="click" side="bottom" alignment="start"
              [dismissOnSelect]="false" [style.--offset-y.px]="layout.submenuOffset()" [style.--okr-submenu-offset.px]="layout.submenuOffset()">
              <ng-template>
                <ion-content>
                  <ion-list>
                    <okr-bar-more [rows]="moreRows()" [rootName]="rootName()" />
                  </ion-list>
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </div>
        <ion-buttons slot="end">
          <okr-connection-status-button />
          <ng-content select="[okrMenuBarEnd]" />
          @if (store.currentUser(); as currentUser) {
            <okr-avatar-user [currentUser]="currentUser" (profileClicked)="profileClicked.emit()" />
          }
          <ion-button id="{{ popupId }}" [attr.aria-label]="store.i18n.bar_account_menu()">
            <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover #accountPopover class="okr-menu-dropdown" trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="false">
            <ng-template>
              <ion-content>
                <ion-list>
                  <okr-bar-account [rootItems]="store.menu()?.menuItems" />
                  <ion-item lines="none" button detail="false" (click)="openCookieSettings(accountPopover)">
                    <ion-label color="medium" style="font-size: 13px;">{{ store.i18n.bar_cookie_settings() }}</ion-label>
                  </ion-item>
                </ion-list>
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
  `,
})
export class MenuBar {
  protected readonly store = inject(MenuStore);
  private readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly layout = inject(MenuLayout);

  /** The avatar was tapped: the shell opens the profile. */
  public readonly profileClicked = output<void>();
  /** The Cookie-Einstellungen entry was tapped: the shell reopens the consent banner. */
  public readonly cookieSettingsClicked = output<void>();

  protected readonly popupId = contextMenuId('c_menubar');
  protected readonly moreId = contextMenuId('c_menubar_more');

  /** `name` of the root menu document, whose children the bar renders. */
  protected readonly rootName = computed(() => `main_${this.store.tenantId()}`);

  private readonly currentUser = computed(() => this.store.currentUser());
  protected readonly isAdmin = computed(() => hasRole('admin', this.currentUser()));

  /**
   * The rows of the bar: the children of `main_<tenantId>` that pass the feature-block and books
   * gates (`MenuStore.menu`), then the role gate, without login, logout and profile.
   */
  public readonly rows = computed<MenuItemModel[]>(() => {
    const user = this.currentUser();
    return visibleBarRows(
      this.store.menu()?.menuItems ?? [],
      this.menuItemsStore.menuItems() ?? [],
      item => hasRole(item.roleNeeded, user),
    );
  });

  /**
   * Above `MAX_MENU_BAR_ITEMS` visible rows the bar shows five and the rest sit under «Mehr» (spec §6.5).
   * The form refuses such a menu, but the picker appends rows without validation.
   */
  private readonly split = computed(() => splitBarRows(this.rows()));
  protected readonly shownRows = computed(() => this.split().shown);
  protected readonly moreRows = computed(() => this.split().more);
  /** The current page lies under «Mehr», in a row or below one. */
  protected readonly moreOnPath = computed(() => {
    const active = this.menuItemsStore.activeMenu();
    return !!active && this.moreRows().some(row => row.name === active.key || active.ancestors.includes(row.name));
  });

  /** `call`, `toggle` and `workflow` rows have no hosting feature at root level, so only these two show. */
  protected readonly segmentRows = computed(() => this.shownRows().filter(row => row.action === 'navigate' || row.action === 'browse'));
  /** A segment cannot hold a submenu (spec §8.2); the form refuses one, but the picker can still add it. */
  protected readonly subRows = computed(() => this.shownRows().filter(row => row.action === 'sub'));
  protected readonly subNames = computed(() => this.subRows().map(row => row.name).join(', '));

  /** The active row's key as a plain string, so the segment is re-created on a new row only. */
  protected readonly activeKey = computed(() => this.menuItemsStore.activeMenu()?.key);

  constructor() {
    // Idempotent. Without it, an app whose burger is never opened (the bar replaces it) would never
    // learn the real document value, and a stale per-device hint would stick.
    this.layout.start();
    effect(() => this.store.setMenuName(this.rootName()));
  }

  protected select(row: MenuItemModel): void {
    void this.store.select(row, false);
  }

  /** The popover has no dismissOnSelect, so this entry closes it itself. */
  protected openCookieSettings(popover: IonPopover): void {
    void dismissOverlay(popover);
    this.cookieSettingsClicked.emit();
  }
}

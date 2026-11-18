import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonPopover } from '@ionic/angular';

import { MenuItemModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AvatarUser, ConnectionStatusButton } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { contextMenuId, hasRole } from '@okr/shared-util-core';

import { buildStaticRows, StaticMenuRow, staticBulletColorCss } from '@okr/cms-menu-util';

import { MenuBarAccount } from './menu-bar-account';
import { MenuBarLabel } from './menu-bar-label';
import { MenuItemsStore } from './menu-items.store';
import { MenuLayout } from './menu-layout.service';
import { MenuStore } from './menu.store';

/**
 * The main menu as a fixed block at the top of the page content (static-layout spec 1.163 §5, §6).
 * The shell renders one instance, inside `#main` above the router outlet, while
 * `MenuLayout.staticActive()` is true. It has the same public surface as `MenuBar` (outputs and the
 * `[okrMenuBarEnd]` slot), so the shell swaps the two.
 *
 * A three-column grid: bullet, label, and (with `horizontal` children) the children of a `sub` row.
 * Column 3 therefore starts at one x for every row. Every cell names its column and leaves the row to
 * auto-placement, so a cell whose column lies before the previous one starts a new line; `vertical`
 * children rely on this: each takes columns 2–3 of its own line, column 1 stays empty. With `bulletShape: 'none'` the bullet column is
 * not rendered and the grid has two columns. A `divider` is an empty line of half a row.
 *
 * The block's height varies with its rows, so a `ResizeObserver` on the inner `div.static` reports it
 * to `MenuLayout.setStaticHeight`, which offsets the outlet by it plus the safe area. It observes the
 * inner wrapper, not the host, because the host's `padding-top` is the safe area, which `barTop` adds
 * itself. `div.static` has no padding of its own, so its content box is the whole visible block.
 *
 * The account area (connection status, the projection slot, avatar and the «…» popover with
 * `okr-bar-account` and Cookie-Einstellungen) sits at the inline end of the first line, as in
 * `MenuBar`; that popover has no `dismissOnSelect` for the same reason (see `MenuBar`).
 */
@Component({
  selector: 'okr-menu-static',
  imports: [
    NgTemplateOutlet, MenuBarAccount, MenuBarLabel, SvgIconPipe, AvatarUser, ConnectionStatusButton,
    IonButton, IonIcon, IonPopover, IonContent, IonList, IonLabel, IonItem,
  ],
  providers: [MenuStore],
  styles: [`
    :host {
      position: absolute;
      top: 0;
      inset-inline: 0;
      z-index: 2;
      display: block;
      padding-top: var(--ion-safe-area-top, 0px);
      background: var(--ion-background-color);
      --okr-static-row: 28px;
    }
    .static { display: flex; align-items: flex-start; gap: 12px; }
    .rows { flex: 1 1 auto; min-width: 0; padding: 8px 0 8px 16px; }
    .account { flex: 0 0 auto; display: flex; align-items: center; padding: 4px 8px 0 0; }
    .grid {
      display: grid;
      grid-template-columns: auto auto 1fr;
      row-gap: 4px;
      column-gap: 12px;
      align-items: center;
      --label-col: 2;
      --children-col: 3;
    }
    .grid.no-bullet { grid-template-columns: auto 1fr; --label-col: 1; --children-col: 2; }
    .bullet-cell { grid-column: 1; display: flex; align-items: center; }
    .label-cell { grid-column: var(--label-col); display: flex; align-items: center; min-width: 0; }
    .children-cell {
      grid-column: var(--children-col);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      column-gap: 24px;
      padding-inline-start: var(--okr-submenu-offset);
    }
    .child-line { grid-column: var(--label-col) / -1; padding-inline-start: var(--okr-submenu-offset); }
    .divider { grid-column: 1 / -1; height: calc(var(--okr-static-row) / 2); }
    .bullet { display: inline-block; flex: 0 0 auto; background: var(--okr-static-bullet); }
    .entry { display: inline-flex; align-items: center; gap: 12px; }
    button {
      all: unset;
      box-sizing: border-box;
      min-height: var(--okr-static-row);
      padding: 0 4px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--ion-text-color);
      font: inherit;
      white-space: nowrap;
    }
    button:hover { background: rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.08); }
    button:focus-visible { outline: 2px solid var(--okr-static-bullet); outline-offset: 2px; }
    .active-bold { font-weight: 600; }
    .active-color { color: var(--okr-static-bullet); }
    .active-underline { text-decoration: underline 2px var(--okr-static-bullet); text-underline-offset: 4px; }
    .warn { margin-top: 8px; font-size: 13px; color: var(--ion-color-medium); }
  `],
  template: `
    <div #block class="static"
      [style.--okr-static-bullet]="bulletColor()"
      [style.--okr-submenu-offset.px]="layout.submenuOffset()">
      <nav class="rows" [attr.aria-label]="store.i18n.static_nav_label()">
        <div class="grid" [class.no-bullet]="!showBullet()">
          @for (row of rows(); track $index) {
            @if (row.item.action === 'divider') {
              <div class="divider" aria-hidden="true"></div>
            } @else {
              @if (showBullet()) {
                <div class="bullet-cell"><ng-container *ngTemplateOutlet="bullet" /></div>
              }
              <div class="label-cell">
                @if (row.item.action === 'sub') {
                  <button type="button"
                    [class]="isCurrentPath(row.item) ? activeClass() : ''"
                    [attr.aria-current]="isCurrentPath(row.item) ? 'true' : null"
                    [attr.aria-expanded]="isExpanded(row)"
                    (click)="toggle(row.item)">
                    <okr-menu-bar-label [name]="row.item.name" />
                  </button>
                } @else {
                  <button type="button"
                    [class]="isActive(row.item) ? activeClass() : ''"
                    [attr.aria-current]="isActive(row.item) ? 'page' : null"
                    (click)="select(row.item)">
                    <okr-menu-bar-label [name]="row.item.name" />
                  </button>
                }
              </div>
              @if (layout.staticMenu().childrenDirection === 'horizontal') {
                <div class="children-cell">
                  @if (isExpanded(row)) {
                    @for (child of row.children; track child.name) {
                      <ng-container *ngTemplateOutlet="childEntry; context: { $implicit: child }" />
                    }
                  }
                </div>
              } @else if (isExpanded(row)) {
                @for (child of row.children; track child.name) {
                  <div class="child-line">
                    <ng-container *ngTemplateOutlet="childEntry; context: { $implicit: child }" />
                  </div>
                }
              }
            }
          }
        </div>
        @if (isContentAdmin() && cut().length > 0) {
          <div class="warn">{{ store.i18n.static_cut_warning() }}: {{ cut().join(', ') }}</div>
        }
      </nav>
      <div class="account">
        <okr-connection-status-button />
        <ng-content select="[okrMenuBarEnd]" />
        @if (store.currentUser(); as currentUser) {
          <okr-avatar-user [currentUser]="currentUser" (profileClicked)="profileClicked.emit()" />
        }
        <ion-button id="{{ popupId }}" fill="clear" color="medium" [attr.aria-label]="store.i18n.bar_account_menu()">
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
      </div>
    </div>

    <ng-template #bullet>
      <span class="bullet" aria-hidden="true"
        [style.width.px]="layout.staticMenu().bulletSize"
        [style.height.px]="layout.staticMenu().bulletSize"
        [style.border-radius]="layout.staticMenu().bulletShape === 'round' ? '50%' : '0'"></span>
    </ng-template>

    <ng-template #childEntry let-child>
      <span class="entry">
        @if (showBullet()) { <ng-container *ngTemplateOutlet="bullet" /> }
        <button type="button"
          [class]="isActive(child) ? activeClass() : ''"
          [attr.aria-current]="isActive(child) ? 'page' : null"
          (click)="select(child)">
          <okr-menu-bar-label [name]="child.name" />
        </button>
      </span>
    </ng-template>
  `,
})
export class MenuStatic {
  protected readonly store = inject(MenuStore);
  private readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly layout = inject(MenuLayout);

  /** The avatar was tapped: the shell opens the profile. */
  public readonly profileClicked = output<void>();
  /** The Cookie-Einstellungen entry was tapped: the shell reopens the consent banner. */
  public readonly cookieSettingsClicked = output<void>();

  protected readonly popupId = contextMenuId('c_menustatic');

  private readonly blockRef = viewChild.required<ElementRef<HTMLElement>>('block');

  /** `name` of the root menu document, whose children the block renders. */
  protected readonly rootName = computed(() => `main_${this.store.tenantId()}`);

  private readonly currentUser = computed(() => this.store.currentUser());
  protected readonly isContentAdmin = computed(() => hasRole('contentAdmin', this.currentUser()));

  /** Rows and children within the static limits, after the three gates; what does not fit is in `cut`. */
  private readonly built = computed(() => {
    const user = this.currentUser();
    return buildStaticRows(
      this.store.menu()?.menuItems ?? [],
      this.menuItemsStore.menuItems() ?? [],
      item => hasRole(item.roleNeeded, user),
      this.rootName(),
    );
  });
  protected readonly rows = computed(() => this.built().rows);
  protected readonly cut = computed(() => this.built().cut);

  protected readonly showBullet = computed(() => this.layout.staticMenu().bulletShape !== 'none');
  protected readonly bulletColor = computed(() => staticBulletColorCss(this.layout.staticMenu().bulletColor));
  protected readonly activeClass = computed(() => `active-${this.layout.staticMenu().activeStyle}`);

  /** The `sub` row the person opened last (`childrenVisibility: 'active'`); undefined when none. */
  protected readonly openSub = signal<string | undefined>(undefined);

  constructor() {
    // Idempotent, see MenuBar.
    this.layout.start();
    effect(() => this.store.setMenuName(this.rootName()));

    let observer: ResizeObserver | undefined;
    // Browser only: afterNextRender never runs on the server.
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      observer = new ResizeObserver(entries => {
        const entry = entries[entries.length - 1];
        if (entry) this.layout.setStaticHeight(Math.ceil(entry.contentRect.height));
      });
      observer.observe(this.blockRef().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      this.layout.setStaticHeight(0);
    });
  }

  /** The current page is this entry. */
  protected isActive(item: MenuItemModel): boolean {
    return this.menuItemsStore.activeMenu()?.key === item.name;
  }

  /** This `sub` row lies on the path to the current page. */
  protected isCurrentPath(item: MenuItemModel): boolean {
    return this.menuItemsStore.activeMenu()?.ancestors.includes(item.name) ?? false;
  }

  /** Whether the children of a `sub` row are shown (spec §6.3). */
  protected isExpanded(row: StaticMenuRow): boolean {
    if (row.item.action !== 'sub') return false;
    if (this.layout.staticMenu().childrenVisibility === 'always') return true;
    return this.isCurrentPath(row.item) || this.openSub() === row.item.name;
  }

  /** A `sub` row has no url: in `active` mode a click opens or closes its children, in `always` mode it does nothing. */
  protected toggle(item: MenuItemModel): void {
    if (this.layout.staticMenu().childrenVisibility === 'always') return;
    this.openSub.update(name => (name === item.name ? undefined : item.name));
  }

  protected select(item: MenuItemModel): void {
    void this.store.select(item, false);
  }

  /** The popover has no dismissOnSelect, so this entry closes it itself. */
  protected openCookieSettings(popover: IonPopover): void {
    void dismissOverlay(popover);
    this.cookieSettingsClicked.emit();
  }
}

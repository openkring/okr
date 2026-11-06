import { Component, computed, effect, inject, input } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonList, IonPopover } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { contextMenuId } from '@okr/shared-util-core';

import { nextVisitedKeys } from '@okr/cms-menu-util';

import { Menu } from './menu';
import { MenuItemsStore } from './menu-items.store';
import { MenuLayout } from './menu-layout.service';
import { MenuStore } from './menu.store';

/**
 * One row of the `top` menu bar (menu-layouts spec §7): a leaf is a button, a first-level `sub` is a
 * button that opens a dropdown. Levels below the first are today's accordion inside the dropdown
 * (`okr-menu`, `sub` case), so its lazy children and cycle guard keep working.
 *
 * Each row gets its own `MenuStore`, as `Menu` does: `name` is per-node state. Only `navigate`,
 * `browse` and `sub` rows render; `call`, `toggle` and `workflow` rows have no hosting feature at
 * root level, so they stay out of the bar, as in the segmented layout.
 *
 * The dropdown opens on click and has no `dismissOnSelect` (Ionic puts it on the whole wrapper, so
 * an accordion header inside would close it); `Menu.select` closes it, because the class
 * `okr-menu-dropdown` marks it as main navigation. A popover is teleported out of the bar, so
 * `--okr-submenu-offset` does not inherit into it and is bound on the popover itself. Its content
 * sits in an `ng-template`, which renders only while the popover is open: the children are built
 * lazily.
 */
@Component({
  selector: 'okr-menu-bar-item',
  imports: [Menu, SvgIconPipe, IonButton, IonIcon, IonPopover, IonContent, IonList],
  providers: [MenuStore],
  styles: [`
    :host { display: inline-block; flex: 0 1 auto; min-width: 0; }
    ion-button {
      /* the button sits in the secondary toolbar, but not in its ion-buttons, so it takes the colour itself */
      --color: var(--ion-color-secondary-contrast);
      --background-hover: var(--ion-color-secondary-contrast);
      --background-hover-opacity: 0.16;
      height: auto;
      min-height: 40px;
      text-transform: none;
    }
    /* the row on the path to the current page: a 2px underline in the toolbar's contrast colour */
    ion-button.current::part(native) { box-shadow: inset 0 -2px 0 var(--ion-color-secondary-contrast); }
    /* long labels wrap, two lines at most, and are never cut to an ellipsis on one line */
    .label {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      white-space: normal;
      max-width: 160px;
      line-height: 1.2;
    }
  `],
  template: `
    @if (menuItem(); as item) {
      @switch (item.action) {
        @case ('navigate') {
          <ion-button fill="clear" [class.current]="isActive()" [attr.aria-current]="isActive() ? 'page' : null" (click)="select()">
            <span class="label">{{ menuStore.translatedMenuLabel() }}</span>
          </ion-button>
        }
        @case ('browse') {
          <ion-button fill="clear" (click)="select()">
            <span class="label">{{ menuStore.translatedMenuLabel() }}</span>
          </ion-button>
        }
        @case ('sub') {
          @if (menuItemsStore.canOpen(name())) {
            <ion-button id="{{ popupId }}" fill="clear" [class.current]="onPath()" aria-haspopup="true">
              <span class="label">{{ menuStore.translatedMenuLabel() }}</span>
              <ion-icon slot="end" src="{{ 'chevron-down' | svgIcon }}" />
            </ion-button>
            <ion-popover class="okr-menu-dropdown" trigger="{{ popupId }}" triggerAction="click" side="bottom" alignment="start"
              [dismissOnSelect]="false" [style.--offset-y.px]="layout.submenuOffset()" [style.--okr-submenu-offset.px]="layout.submenuOffset()">
              <ng-template>
                <ion-content>
                  <ion-list>
                    @for (childName of item.menuItems; track childName) {
                      <!-- depth 2: the root is 0, this row 1, so its children start at 2 -->
                      <okr-menu [menuName]="childName" [inMainTree]="true" [inputDepth]="2" [inputVisitedKeys]="visitedKeys()" />
                    }
                  </ion-list>
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        }
      }
    }
  `,
})
export class MenuBarItem {
  protected readonly menuStore = inject(MenuStore);
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly layout = inject(MenuLayout);

  /** The `name` of the menu row. */
  public readonly name = input.required<string>();

  protected readonly popupId = contextMenuId('c_menubar_item');

  protected readonly menuItem = computed(() => this.menuStore.menu());
  /** Leaf only: this row is the current page. */
  protected readonly isActive = computed(() => this.menuItemsStore.activeMenu()?.key === this.name());
  /** Dropdown only: the current page lies below this row. */
  protected readonly onPath = computed(() => !!this.menuItemsStore.activeMenu()?.ancestors.includes(this.name()));
  /**
   * The path for the children's cycle guard: the root `main_<tenantId>` and this row, as `Menu` would
   * have built it, so a child pointing back at the root is caught as early as there.
   */
  protected readonly visitedKeys = computed(() => nextVisitedKeys(new Set([`main_${this.menuStore.tenantId()}`]), this.name()));

  constructor() {
    effect(() => this.menuStore.setMenuName(this.name()));
  }

  protected select(): void {
    const item = this.menuItem();
    if (item) void this.menuStore.select(item, false);
  }
}

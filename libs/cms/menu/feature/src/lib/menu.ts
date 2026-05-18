import { Component, computed, effect, forwardRef, inject, input } from '@angular/core';
import { IonAccordion, IonAccordionGroup, IonItem, IonItemDivider, IonLabel, IonList } from '@ionic/angular/standalone';

import { MenuItemModel } from '@bk2/shared-models';
import { Spinner } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { DEFAULT_MENU_ACTION } from '@bk2/shared-constants';

import { MultiAvatar } from '@bk2/cms-menu-ui';

import { MenuStore } from './menu.store';

@Component({
  selector: 'bk-menu',
  standalone: true,
  imports: [
    forwardRef(() => Menu), Spinner, MultiAvatar,
    IonList, IonItem, IonLabel, IonAccordionGroup, IonAccordion, IonItemDivider
  ],
  styles: [`
      ion-icon { color: var(--ion-color-dark); }
    @media (prefers-color-scheme: dark) {
      ion-icon { color: var(--ion-color-white); }
    }
    ::ng-deep ion-accordion ion-icon[slot="start"] { margin-inline-end: 8px; }
    `],
  providers: [MenuStore],
  template: `
    @if(menuStore.isMenuLoading()) {
      <bk-spinner />
    } @else {
      @if (isVisible()) {
        @if(menuItem(); as menuItem) {
          @switch(action()) {
            @case('navigate') {
              <bk-multi-avatar [icon]="icon()" [label]="menuStore.translatedMenuLabel()" [badge]="notificationCount()" (click)="select(menuItem)" />
            }
            @case('browse') {
              <bk-multi-avatar [icon]="icon()" [label]="menuStore.translatedMenuLabel()" [badge]="notificationCount()" (click)="select(menuItem)" />
            }
            @case('sub') {
              <ion-accordion-group>
                <ion-accordion [value]="menuItem.name" toggle-icon-slot="start" >
                  <ion-item slot="header" color="primary">
                    <ion-label>{{ menuStore.translatedMenuLabel() }}</ion-label>
                  </ion-item>
                  <div slot="content">
                    @for(menuItemName of menuItem.menuItems; track menuItemName) {
                      <bk-menu [menuName]="menuItemName" [forceVisible]="forceVisible()" [excludeNames]="excludeNames()" />
                    }
                  </div>
                </ion-accordion>
              </ion-accordion-group>
            }
            @case('divider') {
              <ion-item-divider color="light">
                <ion-label>{{ menuStore.translatedMenuLabel() }}</ion-label>
              </ion-item-divider>
            }
            @case('main') {
              <ion-list>
                @for(menuItemName of menuItem.menuItems; track menuItemName) {
                  <bk-menu [menuName]="menuItemName" [excludeNames]="excludeNames()" />
                }
              </ion-list>
            }
            @case('context') {
              <ion-list>
                @for(menuItemName of menuItem.menuItems; track menuItemName) {
                  <bk-menu [menuName]="menuItemName" />
                }
              </ion-list>
            }
            @case('call') {
              <bk-multi-avatar [icon]="icon()" [label]="menuStore.translatedMenuLabel()" [badge]="notificationCount()" (click)="select(menuItem)" [safariWorkaround]="safariWorkaround()"/>
            }
          }
        } @else {
          <ion-item color="warning">
            <ion-label>Missing: {{ menuName() }}</ion-label>
          </ion-item>
        }
      }
    }
  `
})
export class Menu {
  protected readonly menuStore = inject(MenuStore);

  // inputs
  public menuName = input.required<string>();
  public forceVisible = input(false);
  public excludeNames = input<string[]>([]);

  // derived signals
  protected safariWorkaround = computed(() => this.menuName() === 'files-add');
  protected menuItem = computed(() => this.menuStore.menu());
  private currentUser = computed(() => this.menuStore.currentUser());
  protected roleNeeded = computed(() => this.menuItem()?.roleNeeded);
  protected action = computed(() => this.menuItem()?.action ?? DEFAULT_MENU_ACTION);
  protected icon = computed(() => this.menuItem()?.icon ?? 'help-circle');
  protected readonly isVisible = computed(() => {
    const name = this.menuItem()?.name;
    if (name && this.excludeNames().includes(name)) return false;
    return this.forceVisible() || hasRole(this.roleNeeded(), this.currentUser());
  });
  protected readonly notificationCount = computed(() => this.menuStore.notificationCount());

  constructor() {
    effect(() => {
      this.currentUser();
      this.menuStore.setMenuName(this.menuName());
    });
  }

  protected async select(menuItem: MenuItemModel) {
    this.menuStore.select(menuItem);
  }
}

import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, forwardRef, inject, input } from '@angular/core';
import { IonAccordion, IonAccordionGroup, IonIcon, IonItem, IonItemDivider, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MenuItemModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { SpinnerComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { DEFAULT_MENU_ACTION } from '@bk2/shared-constants';

import { MenuStore } from './menu.store';

@Component({
  selector: 'bk-menu',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    forwardRef(() => MenuComponent), SpinnerComponent,
    IonList, IonItem, IonIcon, IonLabel, IonAccordionGroup, IonAccordion, IonItemDivider
],
  providers: [MenuStore],
  template: `
    @if(menuStore.isLoading()) {
      <bk-spinner />
    } @else {
      @if (isVisible()) {
        @if(menuItem(); as menuItem) {
          @switch(action()) {
            @case('navigate') {
              <ion-item button (click)="select(menuItem)">
                <ion-icon slot="start" src="{{icon() | svgIcon }}" color="primary" />
                <ion-label>{{ label() | translate | async }}</ion-label>
              </ion-item>
            }
            @case('browse') {
              <ion-item button (click)="select(menuItem)">
                <ion-icon slot="start" src="{{icon() | svgIcon }}" color="primary" />
                <ion-label>{{ label() | translate | async }}</ion-label>
              </ion-item>
            }
            @case('sub') {
              <ion-accordion-group>
                <ion-accordion [value]="menuItem.name" toggle-icon-slot="start" >
                  <ion-item slot="header" color="primary">
                    <ion-label>{{label() | translate | async}}</ion-label>
                  </ion-item>
                  <div slot="content">
                    @for(menuItemName of menuItem.menuItems; track menuItemName) {
                      <bk-menu [menuName]="menuItemName" />
                    }
                  </div>
                </ion-accordion>
              </ion-accordion-group>
            }
            @case('divider') {
              <ion-item-divider color="light">
                <ion-label>{{ label() | translate | async }}</ion-label>
              </ion-item-divider>
            }
            @case('main') {
              <ion-list>
                @for(menuItemName of menuItem.menuItems; track menuItemName) {
                  <bk-menu [menuName]="menuItemName" />
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
              <ion-item button (click)="select(menuItem)">
                <ion-icon slot="start" src="{{icon() | svgIcon }}" color="primary" />
                <ion-label>{{ label() | translate | async }}</ion-label>
              </ion-item>
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
export class MenuComponent {
  protected readonly menuStore = inject(MenuStore);

  // inputs
  public menuName = input.required<string>();

  // derived signals
  protected menuItem = computed(() => this.menuStore.menu());
  private currentUser = computed(() => this.menuStore.currentUser());
  protected roleNeeded = computed(() => this.menuItem()?.roleNeeded);
  protected action = computed(() => this.menuItem()?.action ?? DEFAULT_MENU_ACTION);
  protected icon = computed(() => this.menuItem()?.icon ?? 'help-circle');
  protected label = computed(() => this.menuItem()?.label ?? 'LABEL_UNDEFINED');
  protected readonly isVisible = computed(() => hasRole(this.roleNeeded(), this.currentUser()));

  constructor() {
    effect(() => {
      // By reading the currentUser signal, we create a dependency.
      // This effect will now re-run whenever the user logs in or out.
      this.currentUser();
      this.menuStore.setMenuName(this.menuName());
    });
  }

  protected async select(menuItem: MenuItemModel) {
    this.menuStore.select(menuItem);
  }
}

import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, forwardRef, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { IonAccordion, IonAccordionGroup, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, MenuController, ModalController, PopoverController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MenuItemModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { SpinnerComponent } from '@bk2/shared-ui';
import { AppNavigationService, isInSplitPane, navigateByUrl } from '@bk2/shared-util-angular';
import { die, hasRole, warn } from '@bk2/shared-util-core';

import { AuthService } from '@bk2/auth-data-access';
import { getTarget } from '@bk2/cms-menu-util';

import { MenuStore } from './menu.component.store';
import { DEFAULT_MENU_ACTION } from '@bk2/shared-constants';

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
  protected modalController = inject(ModalController);
  public appNavigationService = inject(AppNavigationService);
  private readonly router = inject(Router);
  private readonly menuController = inject(MenuController);
  protected readonly appStore = inject(AppStore);
  protected readonly menuStore = inject(MenuStore);
  protected readonly popoverController = inject(PopoverController);
  protected readonly authService = inject(AuthService);

  public menuName = input.required<string>();

  protected menuItem = computed(() => this.menuStore.menu());
  protected roleNeeded = computed(() => this.menuItem()?.roleNeeded);
  protected action = computed(() => this.menuItem()?.action ?? DEFAULT_MENU_ACTION);
  protected icon = computed(() => this.menuItem()?.icon ?? 'help-circle');
  protected label = computed(() => this.menuItem()?.label ?? 'LABEL_UNDEFINED');
  protected readonly isVisible = computed(() => this.hasRole(this.roleNeeded()));

  constructor() {
    effect(() => {
      // By reading the currentUser signal, we create a dependency.
      // This effect will now re-run whenever the user logs in or out.
      this.appStore.currentUser();
      this.menuStore.setMenuName(this.menuName());
    });
  }

  public async select(menuItem: MenuItemModel): Promise<void> {
    try {
      this.appNavigationService.resetLinkHistory(menuItem.url);
      switch(menuItem.url) {
        case '/auth/login':
          await this.login();
          break;
        case '/auth/logout':
          await this.logout();
          break;
        default:
          await this.selectMenuItem(this.router, menuItem);
      }
      if (!isInSplitPane()) this.menuController.close('main');
    }
    catch(ex) {
      warn('MenuComponent.select: ' + ex);
    }
  }

  private async login(): Promise<void> {
    const _menuItem = this.menuItem();
    if (_menuItem) {
      await navigateByUrl(this.router, _menuItem.url, _menuItem.data);
    } else {
      warn('MenuComponent.login: MenuItem missing');
    }
  }

  private async logout(): Promise<void> {
    this.authService.logout();
    await navigateByUrl(this.router, '/auth/login', this.menuItem()?.data);
  }

  private async selectMenuItem(router: Router, menuItem: MenuItemModel): Promise<void> {
    switch (menuItem.action) {
      case 'browse':
        await Browser.open({ url: menuItem.url, windowName: getTarget(menuItem) });
        break;
      case 'navigate':
        await navigateByUrl(router, menuItem.url, menuItem.data);
        break;
      case 'callFunction':
        this.popoverController.dismiss(menuItem.url);
        break;
      default:
        die('MenuComponent: invalid MenuAction=' + menuItem.action);
    }
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}

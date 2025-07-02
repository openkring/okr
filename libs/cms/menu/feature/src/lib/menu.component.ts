import { Component, computed, effect, inject, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonAccordion, IonAccordionGroup, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, MenuController, ModalController, PopoverController } from '@ionic/angular/standalone';
import { Browser } from '@capacitor/browser';

import { die, hasRole, isInSplitPane, warn } from '@bk2/shared/util-core';
import { AppNavigationService, navigateByUrl } from '@bk2/shared/util-angular';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { MenuAction, MenuItemModel, RoleName } from '@bk2/shared/models';
import { TranslatePipe } from '@bk2/shared/i18n';
import { SpinnerComponent } from '@bk2/shared/ui';
import { AppStore } from '@bk2/shared/feature';

import { getTarget } from '@bk2/cms/menu/util';
import { MenuStore } from './menu.component.store';
import { AuthService } from '@bk2/auth/data-access';

@Component({
  selector: 'bk-menu',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MenuComponent, SpinnerComponent,
    IonList, IonItem, IonIcon, IonLabel, IonAccordionGroup, IonAccordion, IonItemDivider,
    SpinnerComponent
],
  providers: [MenuStore],
  template: `
    @if(menuStore.isLoading()) {
      <bk-spinner />
    } @else {
      @if (isVisible()) {
        @if(menuItem(); as menuItem) {
          @switch(action()) {
            @case(MA.Navigate) {
              <ion-item button (click)="select(menuItem)">
                <ion-icon slot="start" src="{{icon() | svgIcon }}" color="primary" />
                <ion-label>{{ label() | translate | async }}</ion-label>
              </ion-item>
            }
            @case(MA.Browse) {
              <ion-item button (click)="select(menuItem)">
                <ion-icon slot="start" src="{{icon() | svgIcon }}" color="primary" />
                <ion-label>{{ label() | translate | async }}</ion-label>
              </ion-item>
            }
            @case(MA.SubMenu) {
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
            @case(MA.Divider) {
              <ion-item-divider color="light">
                <ion-label>{{ label() | translate | async }}</ion-label>
              </ion-item-divider>
            }
            @case(MA.MainMenu) {
              <ion-list>
                @for(menuItemName of menuItem.menuItems; track menuItemName) {
                  <bk-menu [menuName]="menuItemName" />
                }
              </ion-list>
            }
            @case(MA.ContextMenu) {
              <ion-list>
                @for(menuItemName of menuItem.menuItems; track menuItemName) {
                  <bk-menu [menuName]="menuItemName" />
                }
              </ion-list>
            }
            @case(MA.CallFunction) {
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
  protected roleNeeded = computed(() => this.menuStore.menu()?.roleNeeded);
  protected action = computed(() => this.menuStore.menu()?.action ?? MenuAction.Navigate);
  protected icon = computed(() => this.menuStore.menu()?.icon ?? 'help-circle');
  protected label = computed(() => this.menuStore.menu()?.label ?? 'LABEL_UNDEFINED');
  protected readonly isVisible = computed(() => this.hasRole(this.roleNeeded()));

  constructor() {
    effect(() => {
      // By reading the currentUser signal, we create a dependency.
      // This effect will now re-run whenever the user logs in or out.
      this.appStore.currentUser();
      this.menuStore.setMenuName(this.menuName());
    });
  }

  protected MA = MenuAction;

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
      case MenuAction.Browse:
        await Browser.open({ url: menuItem.url, windowName: getTarget(menuItem) });
        break;
      case MenuAction.Navigate:
        await navigateByUrl(router, menuItem.url, menuItem.data);
        break;
      case MenuAction.CallFunction:
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

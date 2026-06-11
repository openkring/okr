import { Component, computed, inject, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { MenuItemModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { MenuStore } from './menu.store';

@Component({
  selector: 'bk-menu-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, ListFilter,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem, IonGrid, IonRow, IonCol, IonList
  ],
  template: `
    <ion-header>
      <!-- page header -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedMenuItemsCount() }}/{{ menuItemsCount() }} {{ store.i18n.menus() }}</ion-title>
        @if(hasRole('privileged') || !readOnly()) {
          <ion-buttons slot="end">
              <ion-button (click)="add()">
                <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
              </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>

      <!-- description -->
      <ion-toolbar class="ion-hide-md-down">
        <ion-item lines="none">
          <ion-label>{{ store.i18n.description() }}</ion-label>
        </ion-item>
      </ion-toolbar>

      <!-- search and filters -->
      <bk-list-filter
        (searchTermChanged)="onSearchTermChange($event)"
        (typeChanged)="onTypeSelected($event)" [types]="menuActions()"
      />

      <!-- list header -->
      <ion-toolbar color="primary">
        <ion-item color="primary" lines="none">
          <ion-grid>
            <ion-row>
              <ion-col size="6" size-md="4">
                <ion-label><strong>{{ store.i18n.name_label() }}</strong></ion-label>
              </ion-col>
              <ion-col size="6" size-md="4" class="ion-hide-md-down">
                  <ion-label><strong>{{ store.i18n.link() }}</strong></ion-label>
              </ion-col>
              <ion-col size="6" size-md="4">
                  <ion-label><strong>{{ store.i18n.action() }}</strong></ion-label>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-item>
      </ion-toolbar>
    </ion-header>

    <!-- Data -->
    <ion-content #content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if (filteredMenuItems().length === 0) {
          <bk-empty-list [message]="store.i18n.empty()" />
        } @else {
          <ion-list lines="inset">
            @for(menuItem of filteredMenuItems(); track menuItem.bkey) {
                <ion-item (click)="showActions(menuItem)">
                  <ion-label>{{ menuItem.name }}</ion-label>
                  @if(menuItem.action === 'sub') {
                    <ion-label class="ion-hide-md-down">{{ menuItem.menuItems }}</ion-label>
                  }
                  @else {
                    <ion-label class="ion-hide-md-down">{{ menuItem.url }}</ion-label>
                  }
                  <ion-label>{{ menuItem.action }}</ion-label>
                </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class MenuList {
  protected readonly store = inject(MenuStore);
  private actionSheetController = inject(ActionSheetController);

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedCategory = linkedSignal(() => this.store.selectedCategory());

  // computed
  protected filteredMenuItems = computed(() => this.store.filteredMenuItems() ?? []);
  protected menuItemsCount = computed(() => this.store.menuItemsCount());
  protected selectedMenuItemsCount = computed(() => this.filteredMenuItems().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected menuActions = computed(() => this.store.appStore.getCategory('menu_action'));
  protected readOnly = computed(() => !hasRole('contentAdmin', this.store.currentUser()));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected async showActions(menuItem: MenuItemModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('menu.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('menu.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
      await this.executeActions(actionSheetOptions, menuItem);
    } else {
      await this.store.edit(menuItem, this.readOnly());
    }
  }

  private async executeActions(actionSheetOptions: ActionSheetOptions, menuItem: MenuItemModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'menu.delete':
          await this.store.delete(menuItem, this.readOnly());
          break;
        case 'menu.edit':
          await this.store.edit(menuItem, this.readOnly());
          break;
      }
    }
  }

  protected async add(): Promise<void> {
    await this.store.edit(undefined, this.readOnly());
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedCategory(type);
  }
}

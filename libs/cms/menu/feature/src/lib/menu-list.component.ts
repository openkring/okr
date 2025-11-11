import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MenuItemModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, EmptyListComponent, SearchbarComponent, SpinnerComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { MenuItemListStore } from './menu-list.store';
import { MenuStore } from './menu.component.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { ActionSheetController } from '@ionic/angular';

@Component({
  selector: 'bk-menu-item-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SearchbarComponent, CategorySelectComponent, SpinnerComponent, EmptyListComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem, IonGrid, IonRow, IonCol, IonList
  ],
  providers: [MenuItemListStore, MenuStore],
  template: `
    <ion-header>
      <!-- page header -->
      <ion-toolbar color="secondary" id="bkheader">
        <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>
        <ion-title>{{ selectedMenuItemsCount() }}/{{ menuItemsCount() }} {{'@content.menuItem.plural' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          @if(hasRole('privileged') || hasRole('contentAdmin')) {
            <ion-button (click)="edit()">
              <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
            </ion-button>
          }
        </ion-buttons>
      </ion-toolbar>

      <!-- description -->
      <ion-toolbar class="ion-hide-md-down">
        <ion-item lines="none">
          <ion-label>{{ '@content.menuItem.field.description' | translate | async }}</ion-label>
        </ion-item>
      </ion-toolbar>

      <!-- search and category -->
      <ion-toolbar>
        <ion-grid>
          <ion-row>
            <ion-col size="6">
              <bk-searchbar placeholder="{{ '@general.operation.search.placeholder' | translate | async }}" (ionInput)="onSearchtermChange($event)" />
            </ion-col>
            <ion-col size="6">
              <bk-cat-select [category]="menuActions()!" selectedItemName="all" [withAll]="true" (changed)="onCategoryChange($event)" />
          </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>

      <!-- list header -->
      <ion-toolbar color="primary">
        <ion-item color="primary" lines="none">
          <ion-grid>
            <ion-row>
              <ion-col size="6" size-md="4">
                <ion-label><strong>{{ '@content.menuItem.list.header.name' | translate | async }}</strong></ion-label>  
              </ion-col>
              <ion-col size="6" size-md="4" class="ion-hide-md-down">
                  <ion-label><strong>{{ '@content.menuItem.list.header.link' | translate | async }}</strong></ion-label>
              </ion-col>
              <ion-col size="6" size-md="4">
                  <ion-label><strong>{{ '@content.menuItem.list.header.action' | translate | async }}</strong></ion-label>
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
          <bk-empty-list message="@content.menuItem.field.empty" />
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
export class MenuListComponent {
  protected menuItemListStore = inject(MenuItemListStore);
  protected readonly menuStore = inject(MenuStore);
  private actionSheetController = inject(ActionSheetController);

  protected filteredMenuItems = computed(() => this.menuItemListStore.filteredMenuItems() ?? []);
  protected menuItemsCount = computed(() => this.menuItemListStore.menuItemsCount());
  protected selectedMenuItemsCount = computed(() => this.filteredMenuItems().length);
  protected isLoading = computed(() => this.menuItemListStore.isLoading());
  protected menuActions = computed(() => this.menuItemListStore.appStore.getCategory('menu_action'));

  private imgixBaseUrl = this.menuStore.appStore.env.services.imgixBaseUrl;

  protected onSearchtermChange($event: Event): void {
    this.menuItemListStore.setSearchTerm(($event.target as HTMLInputElement).value);
  }

  protected onCategoryChange($event: string): void {
    this.menuItemListStore.setSelectedCategory($event);
  }

  /**
   * Displays an ActionSheet with all possible actions on a MenuItem. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param menuItem 
   */
  protected async showActions(menuItem: MenuItemModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, menuItem);
    await this.executeActions(actionSheetOptions, menuItem);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param menuItem 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, menuItem: MenuItemModel): void {
    if (hasRole('contentAdmin', this.menuStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param menuItem 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, menuItem: MenuItemModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.delete(menuItem);
          break;
        case 'edit':
          await this.edit(menuItem);
          break;
      }
    }
  }

  protected async edit(menuItem?: MenuItemModel): Promise<void> {
    await this.menuItemListStore.edit(menuItem);
    this.menuStore.reload();
  }

  protected async delete(menuItem: MenuItemModel): Promise<void> {
    await this.menuItemListStore.delete(menuItem);
    this.menuStore.reload();
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.menuItemListStore.currentUser());
  }
}




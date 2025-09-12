import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, MenuActions } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AllCategories, MenuAction, MenuItemModel, RoleName } from '@bk2/shared-models';
import { CategoryNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { CategoryComponent, EmptyListComponent, SearchbarComponent, SpinnerComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { MenuItemListStore } from './menu-list.store';
import { MenuStore } from './menu.component.store';

@Component({
  selector: 'bk-menu-item-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, CategoryNamePipe,
    SearchbarComponent, CategoryComponent, SpinnerComponent, EmptyListComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem, IonItemSliding, IonItemOptions, IonItemOption,
    IonGrid, IonRow, IonCol, IonList
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
              <bk-cat name="menuAction" [value]="selectedCategory" [categories]="categories" (changed)="onCategoryChange($event)" />
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
              <ion-item-sliding #slidingItem>
                <ion-item (click)="edit(slidingItem, menuItem)">
                  <ion-label>{{ menuItem.name }}</ion-label>
                  @if(menuItem.action === MA.SubMenu) {
                    <ion-label class="ion-hide-md-down">{{ menuItem.menuItems }}</ion-label>
                  }
                  @else {
                    <ion-label class="ion-hide-md-down">{{ menuItem.url }}</ion-label>
                  }
                  <ion-label>{{ menuItem.action | categoryName:menuActions }}</ion-label>
                </ion-item>
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="delete(slidingItem, menuItem)"><ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" /></ion-item-option>
                  <ion-item-option color="primary" (click)="edit(slidingItem, menuItem)"><ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" /></ion-item-option>
                </ion-item-options>
              </ion-item-sliding>
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

  protected filteredMenuItems = computed(() => this.menuItemListStore.filteredMenuItems() ?? []);
  protected menuItemsCount = computed(() => this.menuItemListStore.menuItemsCount());
  protected selectedMenuItemsCount = computed(() => this.filteredMenuItems().length);
  protected isLoading = computed(() => this.menuItemListStore.isLoading());

  protected selectedCategory = AllCategories;
  protected categories = addAllCategory(MenuActions);
  protected menuActions = MenuActions;
  protected MA = MenuAction;

  protected onSearchtermChange($event: Event): void {
    this.menuItemListStore.setSearchTerm(($event.target as HTMLInputElement).value);
  }

  protected onCategoryChange($event: number): void {
    this.menuItemListStore.setSelectedCategory($event);
  }

  protected async edit(slidingItem?: IonItemSliding, menuItem?: MenuItemModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.menuItemListStore.edit(menuItem);
    this.menuStore.reload();
  }

  protected async delete(slidingItem: IonItemSliding, menuItem: MenuItemModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.menuItemListStore.delete(menuItem);
    this.menuStore.reload();
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.menuItemListStore.currentUser());
  }
}




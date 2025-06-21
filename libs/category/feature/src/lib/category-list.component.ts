import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar, IonItemSliding, IonItemOptions, IonItemOption, IonList, IonPopover } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { RoleName } from '@bk2/shared/config';
import { error, hasRole } from '@bk2/shared/util';
import { CategoryListModel } from '@bk2/shared/models';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { CategoryListStore } from './category-list.store';


@Component({
    selector: 'bk-category-list',
    imports: [
      TranslatePipe, AsyncPipe, SvgIconPipe,
      SpinnerComponent, EmptyListComponent, MenuComponent, ListFilterComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem,
      IonItemOptions, IonItemOption, IonList, IonPopover
    ],
    providers: [CategoryListStore],
    template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedCategoriesCount()}}/{{categoriesCount()}} {{ '@category.plural' | translate | async }}</ion-title>
        @if(hasRole('privileged') || hasRole('eventAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>          
        }
      </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      [tags]="categoryTags()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-grid>
        <ion-row>
          <ion-col size="6" size-lg="3">
            <ion-label><strong>Name</strong></ion-label>
          </ion-col>
          <ion-col size="6" size-lg="3">
            <ion-label><strong>I18nBase</strong></ion-label>
          </ion-col>
          <ion-col size-lg="3" class="ion-hide-lg-down">
            <ion-label><strong>Notes</strong></ion-label>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if(filteredCategories().length === 0) {
        <bk-empty-list message="@category.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(cat of filteredCategories(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-item (click)="edit(cat)">
                <ion-label>{{cat.name}}</ion-label>      
                <ion-label>{{cat.i18nBase}}</ion-label>      
                <ion-label class="ion-hide-lg-down">{{ cat.notes }}</ion-label>
              </ion-item>
              @if(hasRole('privileged') || hasRole('eventAdmin')) {
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="delete(slidingItem, cat)">
                    <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                  </ion-item-option>
                </ion-item-options>
              }
            </ion-item-sliding>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class CategoryListComponent {
  protected categoryListStore = inject(CategoryListStore);
  
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredCategories = computed(() => this.categoryListStore.filteredCategories() ?? []);
  protected categoriesCount = computed(() => this.categoryListStore.categoriesCount());
  protected selectedCategoriesCount = computed(() => this.filteredCategories().length);
  protected isLoading = computed(() => this.categoryListStore.isLoading());
  protected popupId = computed(() => `c_category_${this.listId}`);
  protected categoryTags = computed(() => this.categoryListStore.getTags());
  
  protected isYearly = false;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.categoryListStore.add('mcat_default'); break;
      case 'exportRaw': await this.categoryListStore.export("raw"); break;
      default: error(undefined, `CategoryListComponent.onPopoverDismiss: unknown method ${_selectedMethod}`);
    }
  }

  public async delete(slidingItem?: IonItemSliding, cat?: CategoryListModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (cat) await this.categoryListStore.delete(cat);
  }

  public async edit(cat: CategoryListModel): Promise<void> {
    await this.categoryListStore.edit(cat);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.categoryListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.categoryListStore.setSelectedTag($event);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.categoryListStore.currentUser());
  }
}

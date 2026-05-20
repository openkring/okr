import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { CategoryListModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';
import { AppStore } from '@bk2/shared-feature';

import { Menu } from '@bk2/cms-menu-feature';

import { CategoryStore } from './category.store';

@Component({
    selector: 'bk-category-list',
    standalone: true,
    imports: [
      SvgIconPipe,
      Spinner, EmptyList, Menu, ListFilter,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
    ],
    providers: [CategoryStore],
    template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedCategoriesCount()}}/{{categoriesCount()}} {{ store.i18n.categories() }}</ion-title>
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
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-grid>
        <ion-row>
          <ion-col size="6" size-md="4">
            <ion-label><strong>Name</strong></ion-label>
          </ion-col>
          <ion-col size="4" class="ion-hide-lg-down">
            <ion-label><strong>I18nBase</strong></ion-label>
          </ion-col>
          <ion-col size="6" size-md="4">
            <ion-label><strong>Items</strong></ion-label>
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
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(cat of filteredCategories(); track cat.bkey) {
            <ion-item (click)="showActions(cat)">
              <ion-label>{{cat.name}}</ion-label>      
              <ion-label class="ion-hide-lg-down">{{cat.i18nBase}}</ion-label>      
              <ion-label>{{ cat.items.length }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class CategoryList {
  protected store = inject(CategoryStore);
  private actionSheetController = inject(ActionSheetController);
  private readonly appStore = inject(AppStore);
  private readonly alertService = inject(AlertService);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());

  protected filteredCategories = computed(() => this.store.filteredCategories() ?? []);
  protected categoriesCount = computed(() => this.store.categoriesCount());
  protected selectedCategoriesCount = computed(() => this.filteredCategories().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected popupId = computed(() => `c_category_${this.listId}`);
  protected tags = computed(() => this.store.getTags());
  protected currentUser = computed(() => this.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));

  protected isYearly = false;
  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: this.alertService.error(`CategoryList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Category. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param cat 
   */
  protected async showActions(cat: CategoryListModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, cat);
    await this.executeActions(actionSheetOptions, cat);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param cat 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, cat: CategoryListModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('category.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('category.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param cat 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, cat: CategoryListModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'category.delete':
          await this.store.delete(cat, this.readOnly());
          break;
        case 'category.edit':
          await this.store.edit(cat, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}

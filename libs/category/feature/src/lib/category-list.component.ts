import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';
import { AppStore } from '@bk2/shared-feature';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { CategoryStore } from './category.store';

@Component({
    selector: 'bk-category-list',
    standalone: true,
    imports: [
      TranslatePipe, AsyncPipe, SvgIconPipe,
      SpinnerComponent, EmptyListComponent, MenuComponent, ListFilterComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
    ],
    providers: [CategoryStore],
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
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
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
          @for(cat of filteredCategories(); track cat.bkey) {
            <ion-item (click)="showActions(cat)">
              <ion-label>{{cat.name}}</ion-label>      
              <ion-label>{{cat.i18nBase}}</ion-label>      
              <ion-label class="ion-hide-lg-down">{{ cat.notes }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class CategoryListComponent {
  protected categoryListStore = inject(CategoryStore);
  private actionSheetController = inject(ActionSheetController);
  private readonly appStore = inject(AppStore);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.categoryListStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.categoryListStore.selectedTag());

  protected filteredCategories = computed(() => this.categoryListStore.filteredCategories() ?? []);
  protected categoriesCount = computed(() => this.categoryListStore.categoriesCount());
  protected selectedCategoriesCount = computed(() => this.filteredCategories().length);
  protected isLoading = computed(() => this.categoryListStore.isLoading());
  protected popupId = computed(() => `c_category_${this.listId}`);
  protected tags = computed(() => this.categoryListStore.getTags());
  protected currentUser = computed(() => this.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));

  protected isYearly = false;
  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.categoryListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.categoryListStore.setSelectedTag(tag);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.categoryListStore.add('mcat_default'); break;
      case 'exportRaw': await this.categoryListStore.export("raw"); break;
      default: error(undefined, `CategoryListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Category. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param cat 
   */
  protected async showActions(cat: CategoryListModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, cat);
    await this.executeActions(actionSheetOptions, cat);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param cat 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, cat: CategoryListModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('category.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('category.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('category.delete', this.imgixBaseUrl, 'trash_delete'));
    }
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
      switch (data.action) {
        case 'category.delete':
          await this.categoryListStore.delete(cat, this.readOnly());
          break;
        case 'category.edit':
          await this.categoryListStore.edit(cat, this.readOnly());
          break;
        case 'category.view':
          await this.categoryListStore.edit(cat, true);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.categoryListStore.currentUser());
  }
}

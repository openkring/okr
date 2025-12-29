import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { PageModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { PageStore } from './page.store';

@Component({
  selector: 'bk-page-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent, MenuComponent, ListFilterComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonGrid, IonRow, IonCol, IonList, IonPopover
  ],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedPagesCount()}}/{{pagesCount()}} {{ '@content.page.plural' | translate | async }}</ion-title>
        @if(!readOnly()) {
        <ion-buttons slot="end">
          <ion-button id="c_page">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_page" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
            <ng-template>
              <ion-content>
                <bk-menu [menuName]="contextMenuName()"/>
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>          
      }
    </ion-toolbar>

    <!-- description -->
    <ion-toolbar class="ion-hide-md-down">
      <ion-item lines="none">
        <ion-label>{{ '@content.page.field.description' | translate | async }}</ion-label>
      </ion-item>
    </ion-toolbar>

  <!-- search and filters -->
  <bk-list-filter
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
      (stateChanged)="onStateSelected($event)" [states]="states()"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item color="primary" lines="none">
        <ion-grid>
          <ion-row>
            <ion-col size="4" class="ion-hide-md-down">
              <ion-label><strong>{{ '@content.page.list.header.key' | translate | async }}</strong></ion-label>  
            </ion-col>
            <ion-col size="6" size-md="4">
              <ion-label><strong>{{ '@content.page.list.header.name' | translate | async }}</strong></ion-label>  
            </ion-col>
            <ion-col size="6" size-md="4">
                <ion-label><strong>{{ '@content.page.list.header.sections' | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-item>
    </ion-toolbar>
  </ion-header>
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if (filteredPages().length === 0) {
      <bk-empty-list message="@content.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(page of filteredPages(); track $index) {
          <ion-item (click)="showActions(page)">
            <ion-label class="ion-hide-md-down">{{ page.bkey }}</ion-label>
            <ion-label>{{ page.name }}</ion-label>
            <ion-label>{{ page.sections.length }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class PageAllListComponent {
  protected pageStore = inject(PageStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.pageStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.pageStore.selectedTag());
  protected selectedType = linkedSignal(() => this.pageStore.selectedType());

  // computed
  protected filteredPages = computed(() => this.pageStore.filteredPages() || []);
  protected pagesCount = computed(() => this.pageStore.pagesCount());
  protected selectedPagesCount = computed(() => this.filteredPages().length);
  protected isLoading = computed(() => this.pageStore.isLoading());
  protected tags = computed(() => this.pageStore.getTags());
  protected types = computed(() => this.pageStore.appStore.getCategory('page_type'));
  protected states = computed(() => this.pageStore.appStore.getCategory('content_state'));
  protected currentUser = computed(() => this.pageStore.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));

  // passing constants to the template
  private imgixBaseUrl = this.pageStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.pageStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.pageStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.pageStore.setSelectedType(type);
  }

  protected onStateSelected(state: string): void {
    this.pageStore.setSelectedState(state);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.pageStore.add(this.readOnly()); break;
      case 'exportRaw': await this.pageStore.export("raw"); break;
      default: error(undefined, `PageListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Page. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param page 
   */
  protected async showActions(page: PageModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, page);
    await this.executeActions(actionSheetOptions, page);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param page 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, page: PageModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('page.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('page.show', this.imgixBaseUrl, 'link'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('page.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('page.delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param page 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, page: PageModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'page.delete':
          await this.pageStore.delete(page, this.readOnly());
          break;
        case 'page.edit':
          await this.pageStore.edit(page, this.readOnly());
          break;
        case 'page.view':
          await this.pageStore.edit(page, true);
          break;
        case 'page.show':
          await this.pageStore.show(page, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}




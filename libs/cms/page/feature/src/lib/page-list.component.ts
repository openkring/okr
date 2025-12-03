import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { PageModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { PageListStore } from './page-list.store';

@Component({
  selector: 'bk-page-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent, MenuComponent, ListFilterComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonGrid, IonRow, IonCol, IonList, IonPopover
  ],
  providers: [PageListStore],
  template: `
  <ion-header>
    <!-- page header -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedPagesCount()}}/{{pagesCount()}} {{ '@content.page.plural' | translate | async }}</ion-title>
        @if(hasRole('privileged') || hasRole('contentAdmin')) {
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
      [tags]="pageTags()"
      [type]="pageTypes()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeSelected($event)"
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
        @for(page of filteredPages(); track page.bkey) {
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
  protected pageListStore = inject(PageListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredPages = computed(() => this.pageListStore.filteredPages() || []);
  protected pagesCount = computed(() => this.pageListStore.pagesCount());
  protected selectedPagesCount = computed(() => this.filteredPages().length);
  protected isLoading = computed(() => this.pageListStore.isLoading());
  protected pageTags = computed(() => this.pageListStore.getTags());
  protected pageTypes = computed(() => this.pageListStore.appStore.getCategory('page_type'));
  protected currentUser = computed(() => this.pageListStore.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));

  private imgixBaseUrl = this.pageListStore.appStore.env.services.imgixBaseUrl;

  /******************************* change notifications *************************************** */
  public onSearchtermChange(searchTerm: string): void {
    this.pageListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.pageListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.pageListStore.setSelectedType(type);
  }

  /******************************* actions *************************************** */
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
    if (hasRole('registered', this.pageListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('page.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('page.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.pageListStore.appStore.currentUser())) {
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
      switch (data.action) {
        case 'page.delete':
          await this.pageListStore.delete(page, this.readOnly());
          break;
        case 'page.edit':
          await this.pageListStore.edit(page, this.readOnly());
          break;
        case 'page.view':
          await this.pageListStore.edit(page, true);
          break;
      }
    }
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.pageListStore.add(this.readOnly()); break;
      case 'exportRaw': await this.pageListStore.export("raw"); break;
      default: error(undefined, `PageListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.pageListStore.currentUser());
  }
}




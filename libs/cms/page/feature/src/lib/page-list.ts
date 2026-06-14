import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, InfiniteScrollCustomEvent, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { PageModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { BkListSkeleton, EmptyList, ErrorBanner, ListFilter } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';

import { PageStore } from './page.store';

@Component({
  selector: 'bk-page-all-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    BkListSkeleton, EmptyList, ErrorBanner, Menu, ListFilter,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonGrid, IonRow, IonCol, IonList, IonPopover,
    IonInfiniteScroll, IonInfiniteScrollContent
  ],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedPagesCount()}}/{{pagesCount()}} {{ store.i18n.pages() }}</ion-title>
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
        <ion-label>{{ store.i18n.description() }}</ion-label>
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
              <ion-label><strong>{{ store.i18n.key() }}</strong></ion-label>
            </ion-col>
            <ion-col size="6" size-md="4">
              <ion-label><strong>{{ store.i18n.name_label() }}</strong></ion-label>
            </ion-col>
            <ion-col size="6" size-md="4">
                <ion-label><strong>{{ store.i18n.sections() }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-item>
    </ion-toolbar>
  </ion-header>
<bk-error-banner [message]="store.errorMessage()" (dismiss)="store.clearError()" />
<ion-content #content>
  @if(isLoading()) {
    <bk-list-skeleton [rows]="6" />
  } @else {
    @if (filteredPages().length === 0) {
      <bk-empty-list [message]="store.i18n.empty()" />
    } @else {
      <ion-list lines="inset">
        @for(page of visiblePages(); track page.bkey) {
          <ion-item (click)="showActions(page)">
            <ion-label class="ion-hide-md-down">{{ page.bkey }}</ion-label>
            <ion-label>{{ page.name }}</ion-label>
            <ion-label>{{ page.sections.length }}</ion-label>
          </ion-item>
        }
      </ion-list>
      @if(hasMore()) {
        <ion-infinite-scroll (ionInfinite)="loadMore($event)">
          <ion-infinite-scroll-content />
        </ion-infinite-scroll>
      }
    }
  }
</ion-content>
  `
})
export class PageList {
  protected store = inject(PageStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedType());

  // incremental rendering (ion-infinite-scroll)
  private readonly pageSize = 50;
  protected visibleCount = signal(this.pageSize);
  protected filteredPages = computed(() => this.store.filteredPages() || []);
  protected visiblePages = computed(() => this.filteredPages().slice(0, this.visibleCount()));
  protected hasMore = computed(() => this.visibleCount() < this.filteredPages().length);
  protected pagesCount = computed(() => this.store.pagesCount());
  protected selectedPagesCount = computed(() => this.filteredPages().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.appStore.getCategory('page_type'));
  protected states = computed(() => this.store.appStore.getCategory('content_state'));
  protected currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));

  // passing constants to the template
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** incremental rendering ******************************************* */
  protected loadMore(event: InfiniteScrollCustomEvent): void {
    this.visibleCount.update((c) => c + this.pageSize);
    event.target.complete();
  }

  private resetWindow(): void {
    this.visibleCount.set(this.pageSize);
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.resetWindow();
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.resetWindow();
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.resetWindow();
    this.store.setSelectedType(type);
  }

  protected onStateSelected(state: string): void {
    this.resetWindow();
    this.store.setSelectedState(state);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `PageList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Page. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param page 
   */
  protected async showActions(page: PageModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, page);
    await this.executeActions(actionSheetOptions, page);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param page 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, page: PageModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('page.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('page.show', this.store.i18n.show(), this.imgixBaseUrl, 'link'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('page.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('page.delete', this.store.i18n.delete_label(), this.imgixBaseUrl, 'trash'));
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
          await this.store.delete(page, this.readOnly());
          break;
        case 'page.edit':
          await this.store.edit(page, this.readOnly());
          break;
        case 'page.view':
          await this.store.edit(page, true);
          break;
        case 'page.show':
          await this.store.show(page, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}




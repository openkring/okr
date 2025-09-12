import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, PageTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { PageModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { error } from '@bk2/shared-util-angular';
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
    IonTitle, IonMenuButton, IonContent, IonItem,
    IonItemSliding, IonItemOptions, IonItemOption,
    IonGrid, IonRow, IonCol, IonList, IonPopover
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
      [types]="pageTypes"
      typeName="pageType"
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
          <ion-item-sliding #slidingItem>
            <ion-item (click)="editPage(slidingItem, page)">
              <ion-label class="ion-hide-md-down">{{ page.bkey }}</ion-label>
              <ion-label>{{ page.name }}</ion-label>
              <ion-label>{{ page.sections.length }}</ion-label>
            </ion-item>
            <ion-item-options side="end">
              <ion-item-option color="danger" (click)="deletePage(slidingItem, page)">
                <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
              </ion-item-option>
              <ion-item-option color="primary" (click)="editPage(slidingItem, page)">
                <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class PageAllListComponent {
  protected pageListStore = inject(PageListStore);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredPages = computed(() => this.pageListStore.filteredPages() || []);
  protected pagesCount = computed(() => this.pageListStore.pagesCount());
  protected selectedPagesCount = computed(() => this.filteredPages().length);
  protected isLoading = computed(() => this.pageListStore.isLoading());
  protected pageTags = computed(() => this.pageListStore.getTags());

  protected pageTypes = addAllCategory(PageTypes);

  /******************************* change notifications *************************************** */
  public onSearchtermChange(searchTerm: string): void {
    this.pageListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.pageListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: number): void {
    this.pageListStore.setSelectedType(type);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.pageListStore.add(); break;
      case 'exportRaw': await this.pageListStore.export("raw"); break;
      default: error(undefined, `PageListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async deletePage(slidingItem: IonItemSliding, page: PageModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.pageListStore.delete(page);
  }

  public async editPage(slidingItem?: IonItemSliding, page?: PageModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (page) await this.pageListStore.edit(page);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.pageListStore.currentUser());
  }
}




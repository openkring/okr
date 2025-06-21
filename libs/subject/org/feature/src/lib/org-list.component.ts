import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar, IonItemSliding, IonItemOptions, IonItemOption, IonAvatar, IonImg, IonList, IonPopover } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared/i18n';
import { AvatarPipe, SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { AllCategories, ModelType, OrgModel } from '@bk2/shared/models';
import { addAllCategory, OrgTypes } from '@bk2/shared/categories';
import { RoleName } from '@bk2/shared/config';
import { error, hasRole } from '@bk2/shared/util';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { OrgListStore } from './org-list.store';


@Component({
  selector: 'bk-org-list',
  imports: [
    TranslatePipe, AsyncPipe, AvatarPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonPopover,
    IonItemOptions, IonItemOption, IonAvatar, IonImg, IonList
  ],
  providers: [OrgListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedOrgsCount()}}/{{orgsCount()}} {{ '@subject.org.plural' | translate | async }}</ion-title>
      <ion-buttons slot="end">
        @if(hasRole('privileged') || hasRole('memberAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="c-orgs">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-orgs" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-buttons>
    </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      [tags]="orgTags()"
      [types]="orgTypes"
      typeName="orgType"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeChange($event)"
    />

    <!-- list header -->
    <ion-toolbar color="primary" class="ion-hide-sm-down">
      <ion-grid>
        <ion-row>
          <ion-col size="5">
            <ion-label><strong>{{ '@subject.list.header.name' | translate | async }}</strong></ion-label>
          </ion-col>
          <ion-col size="3">
              <ion-label><strong>{{ '@subject.list.header.phone' | translate | async }}</strong></ion-label>
          </ion-col>
          <ion-col size="4">
            <ion-label><strong>{{ '@subject.list.header.email' | translate | async }}</strong></ion-label>
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
      @if(selectedOrgsCount() === 0) {
        <bk-empty-list message="@subject.org.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(org of filteredOrgs(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-item>
                <ion-avatar slot="start" (click)="edit(undefined, org)">
                  <ion-img src="{{ modelType.Org + '.' + org.bkey | avatar | async }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label (click)="edit(undefined, org)">{{org.name}}</ion-label>      
                <ion-label class="ion-hide-sm-down">
                  @if(org.fav_phone) {
                    <a href="tel:{{org.fav_phone}}" style="text-decoration:none;">
                      <span>{{org.fav_phone }}</span>
                    </a>
                  }
                </ion-label>
                <ion-label class="ion-hide-sm-down">
                  @if(org?.fav_email) {
                    <a href="mailto:{{org.fav_email}}" style="text-decoration:none;">
                      <span>{{org.fav_email }}</span>
                    </a>
                  }
                </ion-label>
                <ion-buttons slot="end" class="ion-hide-sm-up">
                  <ion-button>
                    <ion-icon src="{{'tel' | svgIcon }}" slot="start" color="primary" />
                  </ion-button>
                  <ion-button>
                    <ion-icon src="{{'email' | svgIcon }}" slot="icon-only" color="primary"/>
                  </ion-button>
                </ion-buttons> 
              </ion-item>
              @if(hasRole('memberAdmin')) {
                <ion-item-options side="end">
                  <ion-item-option color="primary" (click)="edit(slidingItem, org)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                  <ion-item-option color="danger" (click)="delete(slidingItem, org)">
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
export class OrgListComponent {
  protected readonly orgListStore = inject(OrgListStore);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredOrgs = computed(() => this.orgListStore.filteredOrgs() ?? []);
  protected orgs = computed(() => this.orgListStore.orgs() ?? []);
  protected orgsCount = computed(() => this.orgListStore.orgsCount());
  protected selectedOrgsCount = computed(() => this.filteredOrgs().length);
  protected isLoading = computed(() => this.orgListStore.isLoading());
  protected orgTags = computed(() => this.orgListStore.getOrgTags());
  
  protected selectedCategory = AllCategories;
  protected orgTypes = addAllCategory(OrgTypes);
  protected modelType = ModelType;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.orgListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.orgListStore.setSelectedTag($event);
  }

  protected onTypeChange(orgType: number): void {
    this.orgListStore.setSelectedType(orgType);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.orgListStore.add(); break;
      case 'exportAddresses': await this.orgListStore.export("addresses"); break;
      case 'exportRaw': await this.orgListStore.export("raw_orgs"); break;
      case 'copyEmailAddresses': await this.orgListStore.copyEmailAddresses(); break;
      default: error(undefined, `OrgListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async edit(slidingItem?: IonItemSliding, org?: OrgModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    org ??= new OrgModel(this.orgListStore.tenantId());
    await this.orgListStore.edit(org);    
  }

  public async delete(slidingItem?: IonItemSliding, org?: OrgModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.orgListStore.delete(org);
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.orgListStore.currentUser());
  }
}

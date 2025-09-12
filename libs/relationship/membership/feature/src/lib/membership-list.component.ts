import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, ModelType, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { error } from '@bk2/shared-util-angular';
import { getYearList, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { CategoryLogPipe, getMembershipName } from '@bk2/relationship-membership-util';
import { addAllCategory, GenderTypes, OrgTypes } from '@bk2/shared-categories';
import { MembershipListStore } from './membership-list.store';

@Component({
  selector: 'bk-membership-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, CategoryLogPipe, AvatarPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
    IonLabel, IonContent, IonItem, IonItemOptions, IonItemOption, IonAvatar, IonImg, IonList, IonPopover
  ],
  providers: [MembershipListStore],
  template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedMembershipsCount()}}/{{membershipsCount()}} {{ title() | translate | async }} {{ '@membership.list.header.titleRel' | translate | async }} {{ orgName() }}</ion-title>
        @if(hasRole('privileged') || hasRole('memberAdmin')) {
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
    @if(membershipCategory(); as cat) {
      <bk-list-filter 
        [tags]="membershipTags()"
        [category]="cat"
        [types]="types()"
        [typeName]="typeName()"
        [years]="years()"
        [yearLabel]="yearLabel()" 
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)"
        (categoryChanged)="onCategorySelected($event)" 
        (typeChanged)="onTypeSelected($event)"
        (yearChanged)="onYearSelected($event)" />
    }

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{'@membership.list.header.name' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@membership.list.header.entryExit' | translate | async}}</strong></ion-label>
        <ion-label class="ion-hide-md-down"><strong>{{'@membership.list.header.category' | translate | async}}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if(filteredMemberships().length === 0) {
        <bk-empty-list message="@membership.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(membership of filteredMemberships(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-item (click)="edit(undefined, membership)">
                <ion-avatar slot="start">
                  <ion-img src="{{ modelType.Person + '.' + membership.memberKey | avatar | async }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{getMembershipName(membership)}}</ion-label>      
                <ion-label>{{membership.relLog | duration:membership.dateOfExit}}</ion-label>      
                <ion-label class="ion-hide-md-down">{{membership.relLog|categoryLog}}</ion-label>
              </ion-item>
              @if(hasRole('memberAdmin')) {
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="delete(slidingItem, membership)">
                    <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                  </ion-item-option>
                  @if(isOngoing(membership)) {
                    <ion-item-option color="warning" (click)="end(slidingItem, membership)">
                      <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                    </ion-item-option>
                    <ion-item-option color="secondary" (click)="changeMembershipCategory(slidingItem, membership)">
                      <ion-icon slot="icon-only" src="{{'swap-horizontal' | svgIcon }}" />
                    </ion-item-option>
                  }
                  <ion-item-option color="primary" (click)="edit(slidingItem, membership)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
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
export class MembershipListComponent {
  protected membershipListStore = inject(MembershipListStore);

  public listId = input.required<string>();
  public orgId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected membershipCategory = computed(() => this.membershipListStore.membershipCategory());
  protected popupId = computed(() => 'c_memberships_' + this.listId() + '_' + this.orgId());
  protected orgName = computed(() => this.membershipListStore.defaultOrgName());
  protected membershipTags = computed(() => this.membershipListStore.getTags());

  protected types = computed(() => {
    return (this.listId() === 'orgs') ? addAllCategory(OrgTypes) : addAllCategory(GenderTypes);
  });
  protected typeName = computed(() => {
    return (this.listId() === 'orgs') ? 'orgType' : 'gender';
  });
  protected years = computed(() => {
    return (this.listId() === 'entries' || this.listId() === 'exits') ? getYearList() : undefined;
  });

  protected filteredMemberships = computed(() => {
    switch (this.listId()) {
      case 'memberships': return this.membershipListStore.filteredMemberships() ?? [];
      case 'persons': return this.membershipListStore.filteredPersons() ?? [];
      case 'orgs': return this.membershipListStore.filteredOrgs() ?? [];
      case 'active': return this.membershipListStore.filteredActive();
      case 'applied': return this.membershipListStore.filteredApplied();
      case 'passive': return this.membershipListStore.filteredPassive();
      case 'cancelled': return this.membershipListStore.filteredCancelled();
      case 'deceased': return this.membershipListStore.filteredDeceased();
      case 'entries': return this.membershipListStore.filteredEntries();
      case 'exits': return this.membershipListStore.filteredExits();
      case 'all':
      default: return this.membershipListStore.filteredMemberships() ?? [];
    }
  });
  protected membershipsCount = computed(() => {
    switch (this.listId()) {
      case 'memberships': return this.membershipListStore.membershipsCount();
      case 'persons': return this.membershipListStore.personsCount();
      case 'orgs': return this.membershipListStore.orgsCount();
      case 'active': return this.membershipListStore.activeCount();
      case 'applied': return this.membershipListStore.appliedCount();
      case 'passive': return this.membershipListStore.passiveCount();
      case 'cancelled': return this.membershipListStore.cancelledCount();
      case 'deceased': return this.membershipListStore.deceasedCount();
      case 'entries': return this.membershipListStore.entriesCount();
      case 'exits': return this.membershipListStore.exitsCount();
      case 'all':
      default: return this.membershipListStore.membershipsCount() ?? [];
    }
  });
  protected title = computed(() => {
    return `@membership.list.${this.listId()}.title`;
  });
  protected yearLabel = computed(() => {
    switch (this.listId()) {
      case 'entries': return '@membership.list.entries.yearLabel';
      case 'exits': return '@membership.list.exits.yearLabel';
      default: return '';
    }
  });
  protected selectedMembershipsCount = computed(() => this.filteredMemberships().length);
  protected isLoading = computed(() => this.membershipListStore.isLoading());

  protected modelType = ModelType;

  constructor() {
    effect(() => this.membershipListStore.setOrgId(this.orgId()));
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch (_selectedMethod) {
      case 'add': await this.membershipListStore.add(); break;
      case 'exportRaw': await this.membershipListStore.export("raw"); break;
      case 'copyEmailAddresses': await this.membershipListStore.copyEmailAddresses(); break;
      default: error(undefined, `MembershipListComponent.onPopoverDismiss: unknown method ${_selectedMethod}`);
    }
  }

  public async delete(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.membershipListStore.delete(membership);
  }

  public async end(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.membershipListStore.end(membership);
  }

  public async edit(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.membershipListStore.edit(membership);
  }

  public async changeMembershipCategory(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.membershipListStore.changeMembershipCategory(membership);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.membershipListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.membershipListStore.setSelectedTag(tag);
  }

  protected onCategorySelected(cat: string): void {
    this.membershipListStore.setSelectedMembershipCategory(cat);
  }

  protected onTypeSelected(type: number): void {
    if (this.listId() === 'orgs') {
      this.membershipListStore.setSelectedOrgType(type);
    } else {
      this.membershipListStore.setSelectedGender(type);
    }
  }

  protected onYearSelected(year: number): void {
    this.membershipListStore.setSelectedYear(year);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.membershipListStore.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }

  protected getMembershipName(membership: MembershipModel): string {
    return getMembershipName(membership);
  }
}

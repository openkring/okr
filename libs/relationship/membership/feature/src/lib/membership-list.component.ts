import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, IonBackdrop } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { coerceBoolean, getYearList, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { CategoryLogPipe, getMembershipName } from '@bk2/relationship-membership-util';
import { MembershipListStore } from './membership-list.store';

@Component({
  selector: 'bk-membership-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, CategoryLogPipe, AvatarPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonAvatar, IonImg, IonList, IonPopover,
    IonBackdrop
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
        [tags]="tags()" (tagChanged)="onTagSelected($event)"
        [category]="cat" (categoryChanged)="onCategorySelected($event)"
        [type]="types()" (typeChanged)="onTypeSelected($event)"
        [years]="years()" (yearChanged)="onYearSelected($event)"
        (searchTermChanged)="onSearchtermChange($event)"
      />
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
      <ion-backdrop />
    } @else {
      @if(filteredMemberships().length === 0) {
        <bk-empty-list message="@membership.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(membership of filteredMemberships(); track $index) {
              <ion-item (click)="showActions(membership)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + membership.memberKey | avatar:'membership' | async }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{getMembershipName(membership)}}</ion-label>      
                <ion-label>{{membership.relLog | duration:membership.dateOfExit}}</ion-label>      
                <ion-label class="ion-hide-md-down">{{membership.relLog|categoryLog}}</ion-label>
              </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class MembershipListComponent {
  protected membershipListStore = inject(MembershipListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public orgId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected membershipCategory = computed(() => this.membershipListStore.membershipCategory());
  protected genders = computed(() => this.membershipListStore.genders());
  protected orgTypes = computed(() => this.membershipListStore.orgTypes());
  protected popupId = computed(() => 'c_memberships_' + this.listId() + '_' + this.orgId());
  protected orgName = computed(() => this.membershipListStore.defaultOrgName());
  protected tags = computed(() => this.membershipListStore.getTags());
  protected types = computed(() => this.listId() === 'orgs' ? this.orgTypes() : this.genders());
  protected years = computed(() => this.listId() === 'entries' || this.listId() === 'exits' ? getYearList() : undefined);
  protected currentUser = computed(() => this.membershipListStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

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

  private imgixBaseUrl = this.membershipListStore.appStore.env.services.imgixBaseUrl;

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

  /**
   * Displays an ActionSheet with all possible actions on a Membership. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param membership 
   */
  protected async showActions(membership: MembershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, membership);
    await this.executeActions(actionSheetOptions, membership);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param membership 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, membership: MembershipModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(membership.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endMembership', this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('changeMcat', this.imgixBaseUrl, 'member_change'));
      }
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param membership 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, membership: MembershipModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'delete':
          await this.membershipListStore.delete(membership, this.readOnly());
          break;
        case 'edit':
          await this.membershipListStore.edit(membership, this.readOnly());
          break;
        case 'view':
          await this.membershipListStore.view(membership);
          break;
        case 'endMembership':
          await this.membershipListStore.end(membership, this.readOnly());
          break;
        case 'changeMcat':
          await this.membershipListStore.changeMembershipCategory(membership, this.readOnly());
          break;
      }
    }
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

  protected onTypeSelected(type: string): void {
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

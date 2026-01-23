import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, IonBackdrop } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModel, MembershipModel, NameDisplay, PersonModelName, RoleName } from '@bk2/shared-models';
import { CatAbbreviationFromRelLogPipe, DurationPipe, FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { DateFormat, getTodayStr, getYearList, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { CategoryLogPipe } from '@bk2/relationship-membership-util';
import { MembershipStore } from './membership.store';

@Component({
  selector: 'bk-membership-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, CategoryLogPipe, AvatarPipe, FullNamePipe, CatAbbreviationFromRelLogPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonAvatar, IonImg, IonList, IonPopover,
    IonBackdrop
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar [color]="color()">
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
    @switch(view()) {
      @case('simple') {
        <bk-list-filter
            (searchTermChanged)="onSearchtermChange($event)"
            (typeChanged)="onTypeSelected($event)" [types]="types()"
          />
      }
      @default {
        @if(membershipCategory(); as cat) {
          <bk-list-filter
            (searchTermChanged)="onSearchtermChange($event)"
            (tagChanged)="onTagSelected($event)" [tags]="tags()"
            (typeChanged)="onTypeSelected($event)" [types]="types()"
            (categoryChanged)="onCategorySelected($event)" [categories]="membershipCategory()"
            (yearChanged)="onYearSelected($event)"
          />
        }
      }
    }


    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{'@membership.list.header.name' | translate | async}}</strong></ion-label>
        @if(view() !== 'simple') {
          <ion-label><strong>{{'@membership.list.header.entryExit' | translate | async}}</strong></ion-label>
          <ion-label class="ion-hide-md-down"><strong>{{'@membership.list.header.category' | translate | async}}</strong></ion-label>
         }
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
                  <ion-img src="{{ membership.memberModelType + '.' + membership.memberKey | avatar:membership.memberModelType }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{membership.memberName1 | fullName:membership.memberName2:nameDisplay()}}</ion-label>      
                  <ion-label class="ion-hide-md-down">{{membership.relLog | duration:membership.dateOfExit}}</ion-label>      
                  <ion-label class="ion-hide-md-down" slot="end">{{membership.relLog|categoryLog}}</ion-label>
                  <ion-label class="ion-hide-md-up" slot="end">{{membership.relLog|catAbbreviationFromRelLog}}</ion-label>
              </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class MembershipListComponent {
  protected membershipStore = inject(MembershipStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public orgId = input.required<string>();
  public group = input<GroupModel | undefined>(undefined);
  public contextMenuName = input.required<string>();
  public color = input('secondary');
  public view = input<'simple' | 'default'>('default');

  // filters
  protected searchTerm = linkedSignal(() => this.membershipStore.searchTerm());
  protected selectedCategory = linkedSignal(() => this.membershipStore.selectedMembershipCategory());
  protected selectedTag = linkedSignal(() => this.membershipStore.selectedTag());
  protected selectedYear = linkedSignal(() => this.membershipStore.selectedYear()); 
  protected isoDate = signal(getTodayStr(DateFormat.IsoDate));

  // computed
  protected membershipListUrl = computed(() => 'membership/' + this.listId() + '/' + this.orgId() + '/' + this.contextMenuName());
  protected membershipCategory = linkedSignal(() => this.membershipStore.membershipCategory());
  protected genders = computed(() => this.membershipStore.genders());
  protected orgTypes = computed(() => this.membershipStore.orgTypes());
  protected popupId = computed(() => 'c_memberships_' + this.listId() + '_' + this.orgId());
  protected orgName = computed(() => this.membershipStore.orgName());
  protected tags = computed(() => this.membershipStore.getTags());
  protected types = computed(() => this.listId() === 'orgs' ? this.orgTypes() : this.genders());
  protected years = computed(() => this.listId() === 'entries' || this.listId() === 'exits' ? getYearList() : undefined);
  protected currentUser = computed(() => this.membershipStore.appStore.currentUser());
  protected readonly nameDisplay = computed(() => this.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected selectedType = linkedSignal(() => {
    return this.listId() === 'orgs' ? this.membershipStore.selectedOrgType() : this.membershipStore.selectedGender();
  });

  protected filteredMemberships = computed(() => {
    switch (this.listId()) {
      case 'memberships': return this.membershipStore.filteredMembers() ?? [];
      case 'persons': return this.membershipStore.filteredPersons() ?? [];
      case 'orgs': return this.membershipStore.filteredOrgs() ?? [];
      case 'active': return this.membershipStore.filteredActive();
      case 'applied': return this.membershipStore.filteredApplied();
      case 'passive': return this.membershipStore.filteredPassive();
      case 'cancelled': return this.membershipStore.filteredCancelled();
      case 'deceased': return this.membershipStore.filteredDeceased();
      case 'entries': return this.membershipStore.filteredEntries();
      case 'exits': return this.membershipStore.filteredExits();
      case 'all':
      default: return this.membershipStore.filteredMembers() ?? [];
    }
  });
  protected membershipsCount = computed(() => {
    switch (this.listId()) {
      case 'memberships': return this.membershipStore.membersCount();
      case 'persons': return this.membershipStore.personsCount();
      case 'orgs': return this.membershipStore.orgsCount();
      case 'active': return this.membershipStore.activeCount();
      case 'applied': return this.membershipStore.appliedCount();
      case 'passive': return this.membershipStore.passiveCount();
      case 'cancelled': return this.membershipStore.cancelledCount();
      case 'deceased': return this.membershipStore.deceasedCount();
      case 'entries': return this.membershipStore.entriesCount();
      case 'exits': return this.membershipStore.exitsCount();
      case 'all':
      default: return this.membershipStore.membersCount() ?? [];
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
  protected isLoading = computed(() => this.membershipStore.isLoading());

  private imgixBaseUrl = this.membershipStore.appStore.env.services.imgixBaseUrl;
  protected personModelName = PersonModelName;
  
  constructor() {
    effect(() => {
      // Ensure orgId is updated whenever it changes
      const orgId = this.orgId();
      if (orgId) {
        this.membershipStore.setOrgId(orgId);
      }
    });
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.membershipStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.membershipStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.membershipStore.setSelectedGender(type);
  }

  protected onCategorySelected(category: string): void {
    this.membershipStore.setSelectedMembershipCategory(category);
  }

  protected onYearSelected(year: number): void {
    this.membershipStore.setSelectedYear(year);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': 
        const group = this.group();
        if (group) {
          await this.membershipStore.addMemberToGroup(group, this.readOnly());
        } else {
          await this.membershipStore.add(this.readOnly());
        }
        break;
      case 'exportRaw': await this.membershipStore.export("raw"); break;
      case 'copyEmailAddresses': await this.membershipStore.copyEmailAddresses(this.listId(), this.readOnly()); break;
      default: error(undefined, `MembershipListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
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
      if (this.view() !== 'simple') {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.imgixBaseUrl, 'eye-on'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('person.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      if (this.view() !== 'simple') {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.imgixBaseUrl, 'create_edit'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(membership.dateOfExit) && this.view() !== 'simple') {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.imgixBaseUrl, 'member_change'));
      }
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.imgixBaseUrl, 'trash_delete'));
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
        case 'membership.delete':
          await this.membershipStore.delete(membership, this.readOnly());
          break;
        case 'membership.edit':
          await this.membershipStore.edit(membership, this.readOnly());
          break;
        case 'membership.view':
          await this.membershipStore.edit(membership, true);
          break;
        case 'person.edit':
          await this.membershipStore.editPerson(membership, this.membershipListUrl(), this.readOnly());
          break;
        case 'person.view':
          await this.membershipStore.editPerson(membership, this.membershipListUrl(), true);
          break;
        case 'membership.end':
          await this.membershipStore.end(membership, undefined, this.readOnly());
          break;
        case 'membership.changecat':
          await this.membershipStore.changeMembershipCategory(membership, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.membershipStore.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}

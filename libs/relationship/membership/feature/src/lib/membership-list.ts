import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, IonBackdrop } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModel, MembershipModel, NameDisplay, PersonModelName, RoleName, UserModel } from '@bk2/shared-models';
import { FullNamePipe, RellogPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { DateFormat, getSvgIconUrl, getTodayStr, getYearList, hasRole, isOngoing } from '@bk2/shared-util-core';
import { SIZE_SM } from '@bk2/shared-constants';

import { AvatarPipe } from '@bk2/avatar-ui';
import { Menu } from '@bk2/cms-menu-feature';
import { getMainContact, isAdminMember } from '@bk2/subject-group-util';

import { MembershipStore } from './membership.store';

@Component({
  selector: 'bk-membership-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, RellogPipe, AvatarPipe, FullNamePipe,
    Spinner, ListFilter, EmptyList, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonAvatar, IonImg, IonList, IonPopover
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar [color]="color()">
        @if(view() !== 'group') {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        }
        @if (hasYearFilter()) {
          <ion-title>{{ selectedMembershipsCount()}} {{ title() | translate | async }} {{ store.i18n.title_rel() }} {{ orgName() }}</ion-title>
        } @else {
          <ion-title>{{ selectedMembershipsCount()}}/{{membershipsCount()}} {{ title() | translate | async }} {{ store.i18n.title_rel() }} {{ orgName() }}</ion-title>
        }
        @if(canChange()) {
          <ion-buttons slot="end">
            <ion-button [id]="popupId">
              <ion-icon slot="icon-only" [src]="'menu' | svgIcon" />
            </ion-button>
            <ion-popover [trigger]="popupId" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()" [forceVisible]="groupAdmin()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>          
        }
      </ion-toolbar>

    <!-- search and filters -->
    @if(view() === 'group') {
      <bk-list-filter
        (searchTermChanged)="onSearchtermChange($event)"
        (typeChanged)="onTypeSelected($event)" [types]="types()"
      />
     } @else {
      <bk-list-filter
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        (typeChanged)="onTypeSelected($event)" [types]="types()"
        (categoryChanged)="onCategorySelected($event)" [categories]="membershipCategory()"
        (yearChanged)="onYearSelected($event)" [years]="years()"
      />
     }

    <!-- list header -->
    <ion-toolbar color="light" class="ion-hide-sm-down">
      <ion-item lines="none">
        <ion-label><strong>{{ store.i18n.name() }}</strong></ion-label>
        @if(view() === 'mcat') {
          <ion-label><strong>{{ store.i18n.category_abbreviation() }}</strong></ion-label>
         }
        @if(view() === 'contact') {
          <ion-label><strong>{{ store.i18n.phone() }}</strong></ion-label>
          <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.email() }}</strong></ion-label>
        }
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if(filteredMemberships().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(membership of filteredMemberships(); track membership.bkey) {
            <ion-item (click)="showActions(membership)">
              <ion-avatar slot="start">
                <ion-img src="{{ membership.memberModelType + '.' + membership.memberKey | avatar:membership.memberModelType }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{membership.memberName1 | fullName:membership.memberName2:nameDisplay()}}</ion-label>
              @if(view() === 'mcat') {
                <ion-label class="ion-hide-sm-down">{{membership.relLog | rellog}}</ion-label>
              }
              @if(view() === 'contact') {
                <ion-label>{{ getPhone(membership) }}</ion-label>
                <ion-label class="ion-hide-md-down">{{ getEmail(membership) }}</ion-label>
              }
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class MembershipList {
  protected store = inject(MembershipStore);
  private actionSheetController = inject(ActionSheetController);
  private cdr = inject(ChangeDetectorRef);

  // inputs
  // persons, orgs, active, applied, passive, cancelled, deceased, entries, exits, all, memberships
  public listId = input.required<string>(); 
  public orgId = input.required<string>();
  public group = input<GroupModel | undefined>(undefined);
  public groupAdmin = input(false);
  public contextMenuName = input.required<string>();
  public color = input('secondary');
  public view = input<'contact' | 'mcat' | 'group'>('mcat');

  // filters
  protected selectedCategory = linkedSignal(() => this.store.selectedMembershipCategory());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedYear = linkedSignal(() => this.store.selectedYear()); 
  protected isoDate = signal(getTodayStr(DateFormat.IsoDate));

  // computed
  protected hasYearFilter = computed(() => this.listId() === 'entries' || this.listId() === 'exits' || this.listId() === 'deceased'); 
  protected membershipCategory = linkedSignal(() => this.hasYearFilter() ? undefined : this.store.membershipCategory());
  protected genders = computed(() => this.store.genders());
  protected orgTypes = computed(() => this.store.orgTypes());
  protected readonly popupId = crypto.randomUUID();
  protected orgName = computed(() => this.store.orgName());
  protected admin = computed(() => getMainContact(this.group()));
  protected tags = computed(() => {
    if (typeof window !== 'undefined' && window.innerWidth < SIZE_SM) return ''; // only show types on desktop, on mobile there is not enough space
    return this.hasYearFilter() ? '' : this.store.getTags();
  });
  protected types = computed(() => {
    if (typeof window !== 'undefined' && window.innerWidth < SIZE_SM) return undefined; // only show types on desktop, on mobile there is not enough space
    return this.hasYearFilter() ? undefined : (this.listId() === 'orgs' ? this.store.orgTypes() : this.store.genders());
  });
  protected years = computed(() => this.hasYearFilter() ? getYearList() : undefined);
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly nameDisplay = computed(() => this.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);
  protected readOnly = computed(() => !this.canChange());
  protected selectedType = linkedSignal(() => {
    return this.listId() === 'orgs' ? this.store.selectedOrgType() : this.store.selectedGender();
  });
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected groupsOfMember = computed(() => this.store.groupsOfMember())
  protected filteredMemberships = computed(() => {
    switch (this.listId()) {
      case 'memberships': return this.store.filteredMembers() ?? [];
      case 'persons': return this.store.filteredPersons() ?? [];
      case 'orgs': return this.store.filteredOrgs() ?? [];
      case 'active': return this.store.filteredActive();
      case 'applied': return this.store.filteredApplied();
      case 'passive': return this.store.filteredPassive();
      case 'cancelled': return this.store.filteredCancelled();
      case 'deceased': return this.store.filteredDeceased();
      case 'entries': return this.store.filteredEntries();
      case 'exits': return this.store.filteredExits();
      case 'all':
      default: return this.store.filteredMembers() ?? [];
    }
  });
  protected membershipsCount = computed(() => {
    switch (this.listId()) {
      case 'memberships': return this.store.membersCount();
      case 'persons': return this.store.personsCount();
      case 'orgs': return this.store.orgsCount();
      case 'active': return this.store.activeCount();
      case 'applied': return this.store.appliedCount();
      case 'passive': return this.store.passiveCount();
      case 'cancelled': return this.store.cancelledCount();
      case 'deceased': return this.store.deceasedCount();
      case 'entries': return this.store.entriesCount();
      case 'exits': return this.store.exitsCount();
      case 'all':
      default: return this.store.membersCount() ?? [];
    }
  });
  protected title = computed(() => {
   return `@relationship/membership/feature.list.${this.listId()}.title`;
  });
  
  protected yearLabel = computed(() => {
    switch (this.listId()) {
      case 'entries': return '@membership.list.entries.yearLabel';
      case 'exits': return '@membership.list.exits.yearLabel';
      default: return '';
    }
  });
  protected selectedMembershipsCount = computed(() => this.filteredMemberships().length);
  protected isLoading = computed(() => this.store.isLoading());

  protected personModelName = PersonModelName;
  
  constructor() {
    effect(() => {
      // Ensure orgId is updated whenever it changes
      const orgId = this.orgId();
      if (orgId) {
        this.store.setOrgId(orgId, this.view() === 'group' ? 'group' : 'org');
      }
    });

    effect(() => {
      // Reset filters when listId changes
      const listId = this.listId();
      const currentListId = this.store.listId();
      
      if (listId && listId !== currentListId) {
        this.store.setListId(listId);
        this.store.resetFilters();
      }
    });
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedGender(type);
  }

  protected onCategorySelected(category: string): void {
    this.store.setSelectedMembershipCategory(category);
  }

  protected onYearSelected(year: number): void {
    this.store.setSelectedYear(year);
  }

  /******************************* getters *************************************** */
  protected getEmail(membership: MembershipModel): string {
    return this.store.getEmail(membership) ?? '';
  }

  protected getPhone(membership: MembershipModel): string {
    return this.store.getPhone(membership) ?? '';
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': 
        const group = this.group();
        if (group) {
          await this.store.addMemberToGroup(group, this.readOnly());
        } else {
          await this.store.add(this.readOnly());
        }
        break;
      case 'memberAdd': await this.store.addNewMember(); break;
      case 'exportRaw': await this.store.export("raw", this.filteredMemberships()); break;
      case 'exportSrv': await this.store.export("srv", this.filteredMemberships()); break;
      case 'exportMembers': await this.store.export("member", this.filteredMemberships()); break;
      case 'exportClubdesk': await this.store.export("clubdesk", this.filteredMemberships()); break;
      case 'exportAddresses': await this.store.export("address", this.filteredMemberships()); break;
      case 'copyEmailAddresses': await this.store.copyEmailAddresses(this.listId(), this.readOnly()); break;
      default: error(undefined, `MembershipList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
    this.cdr.markForCheck();
  }

  /**
   * Displays an ActionSheet with all possible actions on a Membership. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param membership 
   */
  protected async showActions(membership: MembershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    await this.addActionSheetButtons(actionSheetOptions, membership);
    await this.executeActions(actionSheetOptions, membership);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param membership 
   */
  private async addActionSheetButtons(actionSheetOptions: ActionSheetOptions, membership: MembershipModel): Promise<void> {
    // view/edit on membership and person
    if (this.canChange(membership)) {
      if (!this.group()) { // group memberships can not be edited
        actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.store.i18n.update_label(), this.imgixBaseUrl, 'edit'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.store.i18n.person_update(), this.imgixBaseUrl, 'edit'));
    } else { // registered
      if (!this.group()) { // group memberships can not be viewed
        actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.store.i18n.view_label(), this.imgixBaseUrl, 'eye-on'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('person.view', this.store.i18n.person_view(), this.imgixBaseUrl, 'eye-on'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('person.chat', this.store.i18n.chat_open(), this.imgixBaseUrl, 'chatbubbles'));
    actionSheetOptions.buttons.push(createActionSheetDivider());

    // privileged operations on membership
    if (this.canChange(membership) || this.canDelete(membership)) {
      if (isOngoing(membership.dateOfExit) && !this.group()) {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.store.i18n.category_change_label(), this.imgixBaseUrl, 'mcatchange'));
        actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.store.i18n.end_label(), this.imgixBaseUrl, 'stop-circle'));
      }
      if (this.canDelete(membership)) {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.store.i18n.delete_label(), this.imgixBaseUrl, 'trash'));
      }
      actionSheetOptions.buttons.push(createActionSheetDivider());
    }

    // finance operations
    if (this.hasRole('treasurer')) {
      actionSheetOptions.buttons.push(createActionSheetButton('invoice.create', this.store.i18n.invoice_create_label(), this.imgixBaseUrl, 'invoice'));
      actionSheetOptions.buttons.push(createActionSheetDivider());
    }

    // contact operations
    actionSheetOptions.buttons.push(createActionSheetButton('download.vcard', this.store.i18n.download_vcard(), this.imgixBaseUrl, 'download'));
    if (await this.store.isPersonUser(membership.memberKey)) {
    }
    const email = this.store.getEmail(membership);
    if (email) {
      // handler fires synchronously within the tap gesture — required for iOS clipboard access
      actionSheetOptions.buttons.push({
        text: this.store.i18n.copy_email_label(),
        icon: getSvgIconUrl(this.imgixBaseUrl, 'copy'),
        handler: () => { this.store.copy(email); }
      });
      actionSheetOptions.buttons.push(createActionSheetButton('person.sendemail', this.store.i18n.send_email(), this.imgixBaseUrl, 'email'));
    }
    const phone = this.store.getPhone(membership);
    if (phone) {
      // handler fires synchronously within the tap gesture — required for iOS clipboard access
      actionSheetOptions.buttons.push({
        text: this.store.i18n.copy_phone_label(),
        icon: getSvgIconUrl(this.imgixBaseUrl, 'copy'),
        handler: () => { this.store.copy(phone); }
      });
      actionSheetOptions.buttons.push(createActionSheetButton('person.call', this.store.i18n.call_phone(), this.imgixBaseUrl, 'tel'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
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
          await this.store.delete(membership, this.readOnly());
          break;
        case 'membership.edit':
          await this.store.edit(membership, this.readOnly());
          break;
        case 'membership.view':
          await this.store.edit(membership, true);
          break;
        case 'person.chat':
          await this.store.chat(membership);
          break;
        case 'person.edit':
          await this.store.editPerson(membership, this.readOnly());
          break;
        case 'person.view':
          await this.store.editPerson(membership, true);
          break;
        case 'download.vcard':
          await this.store.downloadVcard(membership);
          break;
        case 'membership.end':
          await this.store.end(membership, undefined, this.readOnly());
          break;
        case 'membership.changecat':
          await this.store.changeMembershipCategory(membership, this.readOnly());
          break;
        case 'invoice.create':
          await this.store.createInvoice(membership);
          break;
        case 'person.sendemail':
          await this.store.sendEmail(membership);
          break;
        case 'person.call':
          await this.store.call(membership);
          break;
      }
      this.cdr.markForCheck();
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }

  /**
   * Check whether the current user is allowed to make changes on the data.
   * @returns true if the current user is allowed to make changes
   */
  protected canChange(membership?: MembershipModel): boolean {
    if (this.view() === 'group') {
      if (hasRole('privileged', this.currentUser())) return true;
      if (hasRole('memberAdmin', this.currentUser())) return true;
      if (isAdminMember(this.group(), this.currentUser()?.personKey)) {
        // group admin may only change memberships that belong to the current group
        if (membership && membership.orgKey !== this.orgId()) return false;
        return true;
      }
    } else {
      if (hasRole('memberAdmin', this.currentUser())) return true;
    }
    return false;
  }

  protected canDelete(membership?: MembershipModel): boolean {
    if (hasRole('admin', this.currentUser())) return true;
    if (hasRole('memberAdmin', this.currentUser())) return true;
    if (this.view() === 'group') {
      if (isAdminMember(this.group(), this.currentUser()?.personKey)) {
        // group admin may only delete memberships that belong to the current group
        if (membership && membership.orgKey !== this.orgId()) return false;
        return true;
      }
    }
    return false;
  }
}

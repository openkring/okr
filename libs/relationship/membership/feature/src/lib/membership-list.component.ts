import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, IonBackdrop } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModel, MembershipModel, NameDisplay, PersonModelName, RoleName, UserModel } from '@bk2/shared-models';
import { FullNamePipe, RellogPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { DateFormat, getTodayStr, getYearList, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { MembershipStore } from './membership.store';
import { SIZE_SM } from '@bk2/shared-constants';

@Component({
  selector: 'bk-membership-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, RellogPipe, AvatarPipe, FullNamePipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent, MenuComponent,
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
          <ion-title>{{ selectedMembershipsCount()}} {{ title() | translate | async }} {{ '@membership.list.header.titleRel' | translate | async }} {{ orgName() }}</ion-title>
        } @else {
          <ion-title>{{ selectedMembershipsCount()}}/{{membershipsCount()}} {{ title() | translate | async }} {{ '@membership.list.header.titleRel' | translate | async }} {{ orgName() }}</ion-title>
        }
        @if(canChange()) {
          <ion-buttons slot="end">
            <ion-button [id]="popupId">
              <ion-icon slot="icon-only" [src]="'menu' | svgIcon" />
            </ion-button>
            <ion-popover [trigger]="popupId" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
        <ion-label><strong>{{'@membership.list.header.name' | translate | async}}</strong></ion-label>
        @if(view() === 'mcat') {
          <ion-label><strong>{{'@membership.list.header.category' | translate | async}}</strong></ion-label>
         }
        @if(view() === 'contact') {
          <ion-label><strong>{{ '@subject.list.header.phone' | translate | async }}</strong></ion-label>
          <ion-label class="ion-hide-md-down"><strong>{{ '@subject.list.header.email' | translate | async }}</strong></ion-label>
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
        <bk-empty-list message="@membership.field.empty" />
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
export class MembershipListComponent {
  protected membershipStore = inject(MembershipStore);
  private actionSheetController = inject(ActionSheetController);
  private cdr = inject(ChangeDetectorRef);

  // inputs
  // persons, orgs, active, applied, passive, cancelled, deceased, entries, exits, all, memberships
  public listId = input.required<string>(); 
  public orgId = input.required<string>();
  public group = input<GroupModel | undefined>(undefined);
  public contextMenuName = input.required<string>();
  public color = input('secondary');
  public view = input<'contact' | 'mcat' | 'group'>('mcat');

  // filters
  protected searchTerm = linkedSignal(() => this.membershipStore.searchTerm());
  protected selectedCategory = linkedSignal(() => this.membershipStore.selectedMembershipCategory());
  protected selectedTag = linkedSignal(() => this.membershipStore.selectedTag());
  protected selectedYear = linkedSignal(() => this.membershipStore.selectedYear()); 
  protected isoDate = signal(getTodayStr(DateFormat.IsoDate));

  // computed
  protected membershipListUrl = computed(() => 'membership/' + this.listId() + '/' + this.orgId() + '/' + this.contextMenuName());
  protected hasYearFilter = computed(() => this.listId() === 'entries' || this.listId() === 'exits' || this.listId() === 'deceased'); 
  protected membershipCategory = linkedSignal(() => this.hasYearFilter() ? undefined : this.membershipStore.membershipCategory());
  protected genders = computed(() => this.membershipStore.genders());
  protected orgTypes = computed(() => this.membershipStore.orgTypes());
  protected readonly popupId = crypto.randomUUID();
  protected orgName = computed(() => this.membershipStore.orgName());
  protected admin = computed(() => this.group()?.admin);
  protected tags = computed(() => {
    if (typeof window !== 'undefined' && window.innerWidth < SIZE_SM) return ''; // only show types on desktop, on mobile there is not enough space
    return this.hasYearFilter() ? '' : this.membershipStore.getTags();
  });
  protected types = computed(() => {
    if (typeof window !== 'undefined' && window.innerWidth < SIZE_SM) return undefined; // only show types on desktop, on mobile there is not enough space
    return this.hasYearFilter() ? undefined : (this.listId() === 'orgs' ? this.membershipStore.orgTypes() : this.membershipStore.genders());
  });
  protected years = computed(() => this.hasYearFilter() ? getYearList() : undefined);
  protected currentUser = computed(() => this.membershipStore.appStore.currentUser());
  protected readonly nameDisplay = computed(() => this.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);
  protected readOnly = computed(() => !this.canChange());
  protected selectedType = linkedSignal(() => {
    return this.listId() === 'orgs' ? this.membershipStore.selectedOrgType() : this.membershipStore.selectedGender();
  });

  protected groupsOfMember = computed(() => this.membershipStore.groupsOfMember())
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

    effect(() => {
      // Reset filters when listId changes
      const listId = this.listId();
      const currentListId = this.membershipStore.listId();
      
      if (listId && listId !== currentListId) {
        this.membershipStore.setListId(listId);
        this.membershipStore.resetFilters();
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

  /******************************* getters *************************************** */
  protected getEmail(membership: MembershipModel): string {
    return this.membershipStore.getEmail(membership) ?? '';
  }

  protected getPhone(membership: MembershipModel): string {
    return this.membershipStore.getPhone(membership) ?? '';
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
      case 'memberAdd': await this.membershipStore.addNewMember(); break;
      case 'exportRaw': await this.membershipStore.export("raw", this.filteredMemberships()); break;
      case 'exportSrv': await this.membershipStore.export("srv", this.filteredMemberships()); break;
      case 'exportMembers': await this.membershipStore.export("member", this.filteredMemberships()); break;
      case 'exportClubdesk': await this.membershipStore.export("clubdesk", this.filteredMemberships()); break;
      case 'exportAddresses': await this.membershipStore.export("address", this.filteredMemberships()); break;
      case 'copyEmailAddresses': await this.membershipStore.copyEmailAddresses(this.listId(), this.readOnly()); break;
      default: error(undefined, `MembershipListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
    this.cdr.markForCheck();
  }

  /**
   * Displays an ActionSheet with all possible actions on a Membership. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param membership 
   */
  protected async showActions(membership: MembershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    await this.addActionSheetButtons(actionSheetOptions, membership);
    await this.executeActions(actionSheetOptions, membership);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param membership 
   */
  private async addActionSheetButtons(actionSheetOptions: ActionSheetOptions, membership: MembershipModel): Promise<void> {
    if (this.canChange()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.imgixBaseUrl, 'edit'));
      if (isOngoing(membership.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.imgixBaseUrl, 'mcatchange'));
      }
    } else { // registered
      actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('person.view', this.imgixBaseUrl, 'eye-on'));
    }
    if (await this.membershipStore.isPersonUser(membership.memberKey)) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.chat', this.imgixBaseUrl, 'chatbubbles'));
    }
    if (this.membershipStore.getEmail(membership)) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.copyemail', this.imgixBaseUrl, 'copy'));
      actionSheetOptions.buttons.push(createActionSheetButton('person.sendemail', this.imgixBaseUrl, 'email'));
    }
    if (this.membershipStore.getPhone(membership)) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.copyphone', this.imgixBaseUrl, 'copy'));
      //actionSheetOptions.buttons.push(createActionSheetButton('person.sendsms', this.imgixBaseUrl, 'chatbubble'));
      actionSheetOptions.buttons.push(createActionSheetButton('person.call', this.imgixBaseUrl, 'tel'));
    }
    if (this.canDelete()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
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
          await this.membershipStore.delete(membership, this.readOnly());
          break;
        case 'membership.edit':
          await this.membershipStore.edit(membership, this.readOnly());
          break;
        case 'membership.view':
          await this.membershipStore.edit(membership, true);
          break;
        case 'membership.chat':
          await this.membershipStore.chat(membership);
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

        case 'person.copyemail':
          const email = this.membershipStore.getEmail(membership);
          if (email) {
            await this.membershipStore.copy(email, '@subject.person.operation.copy.email.conf');
          }
          break;
        case 'person.copyphone':
          const phone = this.membershipStore.getPhone(membership);
          if (phone) {
            await this.membershipStore.copy(phone, '@subject.person.operation.copy.phone.conf');
          }
          break;
        case 'person.sendemail':
          await this.membershipStore.sendEmail(membership);
          break;
        case 'person.call':
          await this.membershipStore.call(membership);
          break;
      }
      this.cdr.markForCheck();
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.membershipStore.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }

  /**
   * Check whether the current user is allowed to make changes on the data.
   * @returns true if the current user is allowed to make changes
   */
  protected canChange(): boolean {
    if (this.view() === 'group') {
      if (hasRole('privileged', this.currentUser())) return true;
      if (hasRole('memberAdmin', this.currentUser())) return true;
      if (this.admin()?.key === this.currentUser()?.personKey) return true;
    } else { // normal membership list
      if (hasRole('memberAdmin', this.currentUser())) return true;
    }
    return false;
  }

  /**
   * Check whether the current user is allowed to delete data.
   * @returns true if the current user is allowed to delete
   */
  protected canDelete(): boolean {
    if (hasRole('admin', this.currentUser())) return true;
    if (hasRole('memberAdmin', this.currentUser())) return true;
    if (this.view() === 'group') {
      if (this.admin()?.key === this.currentUser()?.personKey) return true;
    }
    return false;
  }
}

import { Component, computed, effect, inject, input, linkedSignal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonBadge, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonSelect, IonSelectOption, IonTitle, IonToolbar, ToastController } from '@ionic/angular';

import { Menu } from '@okr/cms-menu-feature';
import { RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { error, showToast } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { UserAccountKind, UserAccountRow, UserEditRequest, userEditRequest } from '@okr/user-util';

import { UserAccountActions } from './user-account-actions';
import { UserStore } from './user.store';

@Component({
    selector: 'okr-user-list',
    standalone: true,
    imports: [
      SvgIconPipe,
      Spinner, EmptyList, ListFilter, Menu,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
      IonLabel, IonContent, IonItem, IonList, IonPopover, IonChip, IonBadge, IonSelect, IonSelectOption
    ],
    providers: [UserStore, UserAccountActions],
    template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedUsersCount()}}/{{usersCount()}} {{ store.i18n.title() }}</ion-title>
        @if(hasRole('privileged')) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

    <!-- search and filters -->
    <okr-list-filter 
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
     />

    <!-- chips: Probleme, Erweiterte Rollen (+ role select) -->
    <ion-toolbar>
      <ion-chip [outline]="!problems()" [color]="problems() ? 'warning' : 'medium'" (click)="store.setProblems(!problems())" role="button" tabindex="0" (keydown.enter)="store.setProblems(!problems())">
        <ion-label>{{ store.i18n.filter_problems() }} ({{ problemCount() }})</ion-label>
      </ion-chip>
      <ion-chip [outline]="!extendedRolesOn()" [color]="extendedRolesOn() ? 'primary' : 'medium'" (click)="store.setExtendedRolesOn(!extendedRolesOn())" role="button" tabindex="0" (keydown.enter)="store.setExtendedRolesOn(!extendedRolesOn())">
        <ion-label>{{ store.i18n.filter_extended_roles() }}</ion-label>
      </ion-chip>
      @if(extendedRolesOn()) {
        <ion-select aria-label="{{ store.i18n.filter_extended_roles() }}" interface="popover" [value]="extendedRole()"
          (ionChange)="store.setExtendedRole($event.detail.value)">
          <ion-select-option value="any">{{ store.i18n.filter_role_all() }}</ion-select-option>
          @for(role of roleOptions(); track role) {
            <ion-select-option [value]="role">{{ role }}</ion-select-option>
          }
        </ion-select>
      }
    </ion-toolbar>

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{ store.i18n.loginEmail_label() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.name() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- Data -->
  <ion-content #content>
    @if(isLoading()) {
      <okr-spinner />
    } @else {
      @if(filteredRows().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(row of filteredRows(); track trackKey(row)) {
              <ion-item (click)="showActions(row)">
                <ion-label>{{ row.loginEmail }}</ion-label>
                <ion-label>{{ row.name }}</ion-label>
                @if(kindLabel(row.kind); as label) {
                  <ion-badge slot="end" color="warning">{{ label }}</ion-badge>
                }
              </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class UserList {
  protected store = inject(UserStore);
  private readonly actions = inject(UserAccountActions);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toastController = inject(ToastController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();
  /** query param: the user whose modal to open (the old `/user/:userKey` url redirects here) */
  public edit = input<string>();
  private handledEditKey: string | undefined;

  // derived signals
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected filteredRows = computed(() => this.store.filteredRows());
  protected usersCount = computed(() => this.store.accountRows().filter(r => r.kind === 'normal').length);
  protected selectedUsersCount = computed(() => this.filteredRows().length);
  protected problems = computed(() => this.store.problems());
  protected problemCount = computed(() => this.store.problemCount());
  protected extendedRolesOn = computed(() => this.store.extendedRolesOn());
  protected extendedRole = computed(() => this.store.extendedRole());
  protected roleOptions = computed(() => this.store.extendedRoleOptions());
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected popupId = computed(() => `c_user_${this.listId}`);
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('admin', this.currentUser()));

  // passing constants to the template
  protected isYearly = false;

  constructor() {
    // `?edit=<userKey>`: wait for the users, then open the modal once (userEditRequest decides)
    effect(() => {
      const editKey = this.edit();
      if (!editKey) { this.handledEditKey = undefined; return; }  // cleared: the same key may come again later
      const request = userEditRequest(editKey, this.store.users(), this.store.usersLoaded());
      if (editKey === this.handledEditKey || request.kind === 'none' || request.kind === 'wait') return;
      this.handledEditKey = editKey;
      untracked(() => void this.handleEditRequest(request));
    });
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'add':  await this.store.add(); break;
      case 'exportRaw': await this.store.export('raw'); break;
      case 'exportUsers': await this.store.export('users'); break;
      default: error(undefined, `UserList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /** The row's ActionSheet: every account tool that applies to this row kind (see UserAccountActions). */
  protected async showActions(row: UserAccountRow): Promise<void> {
    await this.actions.show(row);
  }

  /**
   * `?edit=<userKey>` (where the retired `/user/:userKey` page redirects): opens that user's modal
   * once the users are loaded, then clears the param so a reload or back does not open it again.
   */
  private async handleEditRequest(request: UserEditRequest): Promise<void> {
    await this.router.navigate([], { relativeTo: this.route, queryParams: { edit: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (request.kind === 'open') await this.store.edit(request.user, this.readOnly());
    // the users could not be read: say that, not «gibt es nicht» (an empty list proves nothing)
    else if (this.store.failed().users) await showToast(this.toastController, this.store.i18n.read_error());
    else if (request.kind === 'missing') await showToast(this.toastController, this.store.i18n.edit_missing());
  }

  /******************************* helpers *************************************** */
  protected trackKey(row: UserAccountRow): string {
    return `${row.kind}:${row.uid ?? ''}:${row.personKey ?? ''}`;
  }

  /** the badge on problem rows; normal rows get none */
  protected kindLabel(kind: UserAccountKind): string {
    switch (kind) {
      case 'userWithoutLogin': return this.store.i18n.kind_no_login();
      case 'memberWithoutAccount': return this.store.i18n.kind_no_account();
      case 'loginWithoutUser': return this.store.i18n.kind_login_no_user();
      default: return '';
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}

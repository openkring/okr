import { Component, computed, effect, inject, input, linkedSignal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonAvatar, IonBadge, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, ToastController } from '@ionic/angular';

import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { PersonModelName, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ImgDirective, ListFilter, Spinner } from '@okr/shared-ui';
import { AvatarPipe } from '@okr/avatar-ui';
import { error, showToast } from '@okr/shared-util-angular';
import { hasRole, contextMenuId } from '@okr/shared-util-core';

import { UserAccountKind, UserAccountRow, UserEditRequest, userEditRequest } from '@okr/user-util';

import { UserAccountActions } from './user-account-actions';
import { UserStore } from './user.store';

@Component({
    selector: 'okr-user-list',
    standalone: true,
    imports: [
      SvgIconPipe, AvatarPipe,
      Spinner, EmptyList, ListFilter, Menu, ImgDirective,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
      IonLabel, IonContent, IonItem, IonList, IonPopover, IonChip, IonBadge, IonAvatar
    ],
    providers: [UserStore, UserAccountActions],
    styles: [`
      ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
      ion-avatar ion-icon { width: 100%; height: 100%; color: var(--ion-color-medium); }
      .col-name { flex: 1 1 35%; }
      .col-email { flex: 1 1 35%; }
      .col-state { flex: 0 1 30%; text-align: right; }
      .col-state ion-badge { margin-left: 4px; }
    `],
    template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedUsersCount()}}/{{usersCount()}} {{ store.i18n.title() }}</ion-title>
        @if(hasRole('privileged')) {
          <ion-buttons slot="end">
            @if (menuItemsStore.canOpen(contextMenuName())) {
              <ion-button id="{{ popupId }}">
                <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                <ng-template>
                  <ion-content>
                    <okr-menu [menuName]="contextMenuName()"/>
                  </ion-content>
                </ng-template>
              </ion-popover>
            }
          </ion-buttons>
        }
      </ion-toolbar>

    <!-- search and filters -->
    <okr-list-filter 
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
     />

    <!-- chips: filters on all rows -->
    <ion-toolbar>
      <ion-chip [outline]="!problems()" [color]="problems() ? 'warning' : 'medium'" (click)="store.setProblems(!problems())" role="button" tabindex="0" (keydown.enter)="store.setProblems(!problems())">
        <ion-label>{{ store.i18n.filter_problems() }} ({{ problemCount() }})</ion-label>
      </ion-chip>
      <ion-chip [outline]="!extendedRoles()" [color]="extendedRoles() ? 'primary' : 'medium'" (click)="store.setExtendedRoles(!extendedRoles())" role="button" tabindex="0" (keydown.enter)="store.setExtendedRoles(!extendedRoles())">
        <ion-label>{{ store.i18n.filter_extended_roles() }} ({{ extendedRolesCount() }})</ion-label>
      </ion-chip>
    </ion-toolbar>

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label class="col-name"><strong>{{ store.i18n.name() }}</strong></ion-label>
        <ion-label class="col-email ion-hide-sm-down"><strong>{{ store.i18n.loginEmail_label() }}</strong></ion-label>
        <ion-label class="col-state"><strong>{{ store.i18n.column_state() }}</strong></ion-label>
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
                <ion-avatar slot="start">
                  @if(row.personKey) {
                    <img okrImg src="{{ personModelName + '.' + row.personKey | avatar:personModelName }}" alt="Avatar" />
                  } @else {
                    <ion-icon src="{{ 'person' | svgIcon }}" />
                  }
                </ion-avatar>
                <ion-label class="col-name">{{ row.name }}</ion-label>
                <ion-label class="col-email ion-hide-sm-down">{{ row.loginEmail }}</ion-label>
                <ion-label class="col-state">
                  @if(kindLabel(row.kind); as label) {
                    <ion-badge color="warning">{{ label }}</ion-badge>
                  } @else {
                    @for(role of extendedRolesOf(row); track role) {
                      <ion-badge color="primary">{{ role }}</ion-badge>
                    }
                  }
                </ion-label>
              </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class UserList {
  protected readonly menuItemsStore = inject(MenuItemsStore);
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
  protected usersCount = computed(() => this.store.accountRows().length);
  protected selectedUsersCount = computed(() => this.filteredRows().length);
  protected problems = computed(() => this.store.problems());
  protected problemCount = computed(() => this.store.problemCount());
  protected extendedRoles = computed(() => this.store.extendedRoles());
  protected extendedRolesCount = computed(() => this.store.extendedRolesCount());
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected readonly popupId = contextMenuId('c_user');
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('admin', this.currentUser()));

  // passing constants to the template
  protected readonly personModelName = PersonModelName;

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

  /** the roles beyond `registered`, for the third column of a row without a problem */
  protected extendedRolesOf(row: UserAccountRow): RoleName[] {
    return row.roles.filter(role => role !== 'registered');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}

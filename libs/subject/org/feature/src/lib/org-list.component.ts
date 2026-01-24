import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { OrgStore } from './org.store';


@Component({
  selector: 'bk-org-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, AvatarPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonPopover,
    IonAvatar, IonImg, IonList
  ],
  providers: [OrgStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedOrgsCount()}}/{{orgsCount()}} {{ '@subject.org.plural' | translate | async }}</ion-title>
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
    </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
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
            <ion-item (click)="showActions(org)">
              <ion-avatar slot="start">
                <ion-img src="{{ 'org.' + org.bkey | avatar:'org' }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{org.name}}</ion-label>      
              <ion-label class="ion-hide-sm-down">
                @if(org.favPhone) {
                  <a href="{{org.favPhone}}" style="text-decoration:none;">
                    <span>{{org.favPhone }}</span>
                  </a>
                }
              </ion-label>
              <ion-label class="ion-hide-sm-down">
                @if(org?.favEmail) {
                  <a href="{{org.favEmail}}" style="text-decoration:none;">
                    <span>{{org.favEmail }}</span>
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
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class OrgListComponent {
  protected readonly orgStore = inject(OrgStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // derived signals
  protected filteredOrgs = computed(() => this.orgStore.filteredOrgs() ?? []);
  protected orgsCount = computed(() => this.orgStore.orgsCount());
  protected selectedOrgsCount = computed(() => this.filteredOrgs().length);
  protected isLoading = computed(() => this.orgStore.isLoading());
  protected tags = computed(() => this.orgStore.tags());
  protected types = computed(() => this.orgStore.types());
  protected currentUser = computed(() => this.orgStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  private imgixBaseUrl = this.orgStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.orgStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.orgStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.orgStore.setSelectedType(type);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.orgStore.add(this.readOnly()); break;
      case 'exportAddresses': await this.orgStore.export("addresses"); break;
      case 'exportRaw': await this.orgStore.export("raw_orgs"); break;
      case 'copyEmailAddresses': await this.orgStore.copyEmailAddresses(); break;
      default: error(undefined, `OrgListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on an Organization. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param org 
   */
  protected async showActions(org: OrgModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, org);
    await this.executeActions(actionSheetOptions, org);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param org 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, org: OrgModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('org.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('org.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.orgStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('org.delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param org 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, org: OrgModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'org.delete':
          await this.orgStore.delete(org, this.readOnly());
          break;
        case 'org.edit':
          await this.orgStore.edit(org, this.readOnly());
          break;
        case 'org.view':
          await this.orgStore.edit(org, true);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.orgStore.currentUser());
  }
}

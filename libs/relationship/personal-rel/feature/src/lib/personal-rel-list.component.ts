import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { bkTranslate, TranslatePipe } from '@bk2/shared-i18n';
import { PersonalRelModel, RoleName } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getItemLabel, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';
import { PersonalRelNamePipe } from '@bk2/relationship-personal-rel-util';
import { PersonalRelListStore } from './personal-rel-list.store';

@Component({
  selector: 'bk-personal-rel-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe, PersonalRelNamePipe,
    ListFilterComponent, EmptyListComponent, SpinnerComponent,
    MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonImg, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonPopover
  ],
  providers: [PersonalRelListStore],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedPersonalRelsCount()}}/{{personalRelsCount()}} {{ '@personalRel.list.title' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="c-prel">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="c-prel" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="tags()" (tagChanged)="onTagSelected($event)"
      [type]="types()" (typeChanged)="onTypeSelected($event)"
      (searchTermChanged)="onSearchtermChange($event)"
      [showIcons]=false
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{'@personalRel.list.header.person1' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@personalRel.list.header.type' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@personalRel.list.header.person2' | translate | async}}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading() === true) {
      <bk-spinner />
    } @else {
      @if(selectedPersonalRelsCount() === 0) {
        <bk-empty-list message="@personalRel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(personalRel of filteredPersonalRels(); track $index) {
            <ion-grid (click)="showActions(personalRel)">
              <ion-row>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'person.' + personalRel.subjectKey | avatar | async}}" alt="avatar of first person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{personalRel.subjectFirstName | fullName:personalRel.subjectLastName}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6" size-md="4">
                  <ion-item lines="none">
                    <ion-label>{{ personalRel | personalRelName:types() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'person.' + personalRel.objectKey | avatar | async}}" alt="avatar of second person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{personalRel.objectFirstName | fullName:personalRel.objectLastName}}</ion-label>
                  </ion-item> 
                </ion-col>
              </ion-row>
            </ion-grid>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class PersonalRelListComponent {
  protected personalRelListStore = inject(PersonalRelListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredPersonalRels = computed(() => this.personalRelListStore.filteredPersonalRels());
  protected allPersonalRels = computed(() => this.personalRelListStore.allPersonalRels());
  protected personalRelsCount = computed(() => this.personalRelListStore.allPersonalRels()?.length ?? 0);
  protected selectedPersonalRelsCount = computed(() => this.filteredPersonalRels()?.length ?? 0);
  protected isLoading = computed(() => this.personalRelListStore.isLoading());
  protected tags = computed(() => this.personalRelListStore.getTags());
  protected types = computed(() => this.personalRelListStore.appStore.getCategory('personalrel_type'));
  protected currentUser = computed(() => this.personalRelListStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  private imgixBaseUrl = this.personalRelListStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.personalRelListStore.add(); break;
      case 'exportRaw': await this.personalRelListStore.export("raw"); break;
      default: error(undefined, `PersonalRelListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Personal Relationship. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param personalRel 
   */
  protected async showActions(personalRel: PersonalRelModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, personalRel);
    await this.executeActions(actionSheetOptions, personalRel);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param personalRel 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, personalRel: PersonalRelModel): void {
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(personalRel.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endrel', this.imgixBaseUrl, 'stop-circle'));
      }
    }
    actionSheetOptions.buttons.push(createActionSheetButton('view', this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (hasRole('admin', this.personalRelListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param personalRel 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, personalRel: PersonalRelModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      if (data?.action) {
        switch (data.action) {
            case 'delete':
              await this.personalRelListStore.delete(personalRel, this.readOnly());
              break;
            case 'edit':
              await this.personalRelListStore.edit(personalRel, this.readOnly());
              break;
            case 'view':
              await this.personalRelListStore.edit(personalRel, true);
              break;
            case 'endrel':
              await this.personalRelListStore.end(personalRel, this.readOnly());
              break;
          }
        }
      }
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.personalRelListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.personalRelListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(personalRelType: string): void {
    this.personalRelListStore.setSelectedPersonalRelType(personalRelType);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.personalRelListStore.currentUser());
  }

  protected isOngoing(personalRel: PersonalRelModel): boolean {
    return isOngoing(personalRel.validTo);
  }
}

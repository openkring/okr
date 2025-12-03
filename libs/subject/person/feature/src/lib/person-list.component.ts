import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { NameDisplay, PersonModel, PersonModelName, RoleName } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { PersonListStore } from './person-list.store';

@Component({
  selector: 'bk-person-list',
  standalone: true,
  imports: [
    TranslatePipe, FullNamePipe, AsyncPipe, AvatarPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent, ListFilterComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonPopover,
    IonAvatar, IonImg, IonList
  ],
  providers: [PersonListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ filteredPersonsCount()}}/{{personsCount()}} {{ '@subject.person.plural' | translate | async }}</ion-title>
      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c-persons">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c-persons" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="tags()" (tagChanged)="onTagSelected($event)"
      [type]="types()" (typeChanged)="onGenderSelected($event)"
      (searchTermChanged)="onSearchtermChange($event)"
    />

    <!-- list header -->
    <ion-toolbar color="light" class="ion-hide-sm-down">
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
      @if(filteredPersonsCount() === 0) {
        <bk-empty-list message="@subject.person.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(person of filteredPersons(); track $index) {
            <ion-item (click)="showActions(person)">
              <ion-avatar slot="start">
                <ion-img src="{{ personModelName + '.' + person.bkey | avatar:personModelName | async }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{person.firstName | fullName:person.lastName:nameDisplay()}}</ion-label>      
              <ion-label>
                @if(person.favPhone) {
                  <a href="tel:{{person.favPhone}}" style="text-decoration:none;">
                    <span>{{person.favPhone }}</span>
                  </a>
                }
              </ion-label>
              <ion-label class="ion-hide-sm-down">
                @if(person?.favEmail) {
                  <a href="mailto:{{person.favEmail}}" style="text-decoration:none;">
                    <span>{{person.favEmail }}</span>
                  </a>
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
export class PersonListComponent {
  protected readonly personListStore = inject(PersonListStore);
  private readonly actionSheetController = inject(ActionSheetController);

  public readonly listId = input.required<string>();
  public readonly contextMenuName = input.required<string>();

  protected personsCount = computed(() => this.personListStore.personsCount());
  protected filteredPersons = computed(() => this.personListStore.filteredPersons() ?? []);
  protected filteredPersonsCount = computed(() => this.filteredPersons().length);
  protected isLoading = computed(() => this.personListStore.isLoading());
  protected readonly tags = computed(() => this.personListStore.getTags());
  protected readonly types = computed(() => this.personListStore.appStore.getCategory('gender'));
  protected readonly currentUser = computed(() => this.personListStore.appStore.currentUser());
  protected readonly nameDisplay = computed(() => this.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);
  private readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  private imgixBaseUrl = this.personListStore.appStore.env.services.imgixBaseUrl;
  protected personModelName = PersonModelName;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.personListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.personListStore.setSelectedTag($event);
  }

  protected onGenderSelected($event: string): void {
    this.personListStore.setSelectedGender($event);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.personListStore.add(this.readOnly()); break;
      case 'exportRaw': await this.personListStore.export('raw'); break;
      case 'copyEmailAddresses': await this.personListStore.copyEmailAddresses(); break;
      default: error(undefined, `PersonListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Person. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param person 
   */
  protected async showActions(person: PersonModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, person);
    await this.executeActions(actionSheetOptions, person);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param person 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, person: PersonModel): void {    
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.view', this.imgixBaseUrl, 'eye-on'));
      if (person.favEmail) {
        actionSheetOptions.buttons.push(createActionSheetButton('address.email.copy', this.imgixBaseUrl, 'copy'));
        actionSheetOptions.buttons.push(createActionSheetButton('address.email.send', this.imgixBaseUrl, 'email'));
      }
      if (person.favPhone) {
        actionSheetOptions.buttons.push(createActionSheetButton('address.phone.copy', this.imgixBaseUrl, 'copy'));
        //tbd: actionSheetOptions.buttons.push(createActionSheetButton('address.phone.sms', this.imgixBaseUrl, 'chatbubble'));
        actionSheetOptions.buttons.push(createActionSheetButton('address.phone.call', this.imgixBaseUrl, 'tel'));
      }
/*   tbd:    if (person.favCity && person.favStreetName && person.favZipCode) {
        actionSheetOptions.buttons.push(createActionSheetButton('person.show', this.imgixBaseUrl, 'location'));
      } */
     /*
       tbd: if person isUser:  send direct message
      actionSheetOptions.buttons.push(createActionSheetButton('address.chat.start', this.imgixBaseUrl, 'chatbubble'));

     */
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param person 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, person: PersonModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      console.log('PersonListComponent.executeActions', data);
      switch (data.action) {
        case 'person.view':
          await this.personListStore.edit(person, true);
          break;
        case 'address.email.copy':
          await this.personListStore.copy(person.favEmail, '@subject.person.operation.copy.email.conf');
          break;
        case 'address.phone.copy':
          await this.personListStore.copy(person.favPhone, '@subject.person.operation.copy.phone.conf');
          break;
        case 'address.email.send':
          await this.personListStore.sendEmail(person.favEmail);
          break;
        case 'address.phone.call':
          await this.personListStore.call(person.favPhone);
          break;
        case 'person.delete':
          await this.personListStore.delete(person, this.readOnly());
          break;
        case 'person.edit':
          await this.personListStore.edit(person, this.readOnly());
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}


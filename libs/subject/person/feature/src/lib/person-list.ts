import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { NameDisplay, PersonModel, PersonModelName, RoleName } from '@okr/shared-models';
import { FullNamePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';
import { SIZE_MD } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';

import { AvatarPipe } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import { resolveVcardCapability, VCARD_I18N_KEYS, VcardI18n } from '@okr/vcard-util';

import { PersonStore } from './person.store';

@Component({
  selector: 'okr-person-list',
  standalone: true,
  imports: [
    FullNamePipe, AvatarPipe, SvgIconPipe,
    Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonPopover,
    IonAvatar, IonImg, IonList
  ],
  providers: [PersonStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title class="ion-hide-sm-down">{{ filteredPersonsCount()}}/{{personsCount()}} {{ store.i18n.persons() }}</ion-title>
      <ion-title class="ion-hide-sm-up">{{ filteredPersonsCount()}} {{ store.i18n.persons() }}</ion-title>
      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c-persons">
            <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c-persons" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      (tagChanged)="onTagSelected($event)" [tags]="tags()" [hideTagsOnMobile]="true"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />

    <!-- list header -->
    <ion-toolbar color="light" class="ion-hide-sm-down">
      <ion-item lines="none">
        <ion-label><strong>{{ store.i18n.name() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.phone_label() }}</strong></ion-label>
        <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.email_label() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <okr-spinner />
    } @else {
      @if(filteredPersonsCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(person of filteredPersons(); track $index) {
            <ion-item (click)="showActions(person)">
              <ion-avatar slot="start">
                <ion-img src="{{ personModelName + '.' + person.okey | avatar:personModelName }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{person.firstName | fullName:person.lastName:nameDisplay()}}</ion-label>      
              <ion-label class="ion-hide-sm-down">
                @if(favPhone(person); as phone) {
                  <span>{{phone}}</span>
                }
              </ion-label>
              <ion-label class="ion-hide-md-down">
                @if(favEmail(person); as email) {
                  <span>{{email}}</span>
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
export class PersonList {
  protected readonly store = inject(PersonStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs
  public readonly listId = input.required<string>();
  public readonly contextMenuName = input.required<string>();

  // derived signals
  protected personsCount = computed(() => this.store.personsCount());
  protected filteredPersons = computed(() => this.store.filteredPersons() ?? []);
  protected filteredPersonsCount = computed(() => this.filteredPersons().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected readonly tags = computed(() => this.store.getTags());
  protected readonly types = computed(() => this.store.appStore.getCategory('gender'));
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly nameDisplay = computed(() => this.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);
  private readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // contact data from the address-directory projection (spec 1.19 Phase 4)
  protected favEmail(person: PersonModel): string {
    return this.store.appStore.getDirectoryEntry(`person.${person.okey}`)?.favEmail ?? '';
  }

  protected favPhone(person: PersonModel): string {
    return this.store.appStore.getDirectoryEntry(`person.${person.okey}`)?.favPhone ?? '';
  }
  protected personModelName = PersonModelName;
  protected readonly vcardI18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;

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

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export('raw'); break;
      case 'copyEmailAddresses': await this.store.copyEmailAddresses(); break;
      default: this.alertService.error(`PersonList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Person. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param person 
   */
  protected async showActions(person: PersonModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    await this.addActionSheetButtons(actionSheetOptions, person);
    await this.executeActions(actionSheetOptions, person);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param person 
   */
  private async addActionSheetButtons(actionSheetOptions: ActionSheetOptions, person: PersonModel): Promise<void> {
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      if (this.hasRole('admin')) {
        actionSheetOptions.buttons.push(createActionSheetButton('person.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
      }
    } else {  // registered user
      actionSheetOptions.buttons.push(createActionSheetButton('person.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    }
    actionSheetOptions.buttons.push(createActionSheetDivider());

    // all users
    // no direct chat to oneself
    if (person.okey !== this.currentUser()?.personKey && await this.store.isPersonUser(person.okey)) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.chat', this.store.i18n.send_message(), this.imgixBaseUrl, 'chatbubbles'));
    }
    if (this.favEmail(person)) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.copyemail', this.store.i18n.copy_email(), this.imgixBaseUrl, 'copy'));
      actionSheetOptions.buttons.push(createActionSheetButton('person.sendemail', this.store.i18n.send_email(), this.imgixBaseUrl, 'email'));
    }
    if (this.favPhone(person)) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.copyphone', this.store.i18n.copy_phone(), this.imgixBaseUrl, 'copy'));
      //actionSheetOptions.buttons.push(createActionSheetButton('person.sendsms', this.imgixBaseUrl, 'chatbubble'));
      actionSheetOptions.buttons.push(createActionSheetButton('person.call', this.store.i18n.call_phone(), this.imgixBaseUrl, 'tel'));
    }
    if (person.favZipCode) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.show', this.store.i18n.show_postal(), this.imgixBaseUrl, 'location'));
    }
    if (resolveVcardCapability(this.currentUser()?.roles, 1).allowed) {
      actionSheetOptions.buttons.push(createActionSheetButton('person.vcard', this.vcardI18n.action_label(), this.imgixBaseUrl, 'download'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
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
      switch (data.action) {
        case 'person.view':
          await this.store.edit(person, true);
          break;
        case 'person.chat':
          await this.store.chat(person);
          break;
        case 'person.copyemail':
          await this.store.copy(this.favEmail(person), this.store.i18n.copy_email_conf());
          break;
        case 'person.copyphone':
          await this.store.copy(this.favPhone(person), this.store.i18n.copy_phone_conf());
          break;
        case 'person.sendemail':
          await this.store.sendEmail(this.favEmail(person));
          break;
        case 'person.call':
          await this.store.call(this.favPhone(person));
          break;
        case 'person.delete':
          await this.store.delete(person, this.readOnly());
          break;
        case 'person.show':
          await this.store.showOnMap(person);
          break;
        case 'person.edit':
          await this.store.edit(person, this.readOnly());
          break;
        case 'person.vcard':
          await this.store.exportVcard(person);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}


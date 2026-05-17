import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAccordionGroup, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AddressModel, OrgModel, PersonModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions, downloadToBrowser, navigateByUrl } from '@bk2/shared-util-angular';
import { generateRandomString, getCategoryIcon, hasRole } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { FavoriteColorPipe, FormatAddressPipe } from '@bk2/subject-address-util';
import { AvatarPipe } from '@bk2/avatar-ui';

import { AddressStore } from './addresses.store';

import { PFX } from './scope';

@Component({
  selector: 'bk-addresses-list',
  standalone: true,
  imports: [
    SvgIconPipe, FavoriteColorPipe, FormatAddressPipe, AvatarPipe,
    Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonImg,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonAvatar,
    IonAccordion, IonAccordionGroup,
],
  providers: [AddressStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    .avatar { padding-left: 10px; }
    .addresses { padding-left: 60px; }
  `],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredAddressesCount()}}/{{addressesCount()}} {{ i18n.addresses() }}</ion-title>
      </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      (searchTermChanged)="onSearchtermChange($event)"
      (typeChanged)="onChannelSelected($event)" [types]="channels()"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
    />

      <!-- list header -->
      <ion-toolbar color="primary">
        @if(!selectedChannel()) {
          <ion-buttons slot="start">
            <ion-button fill="clear" (click)="toggleExpandAll()">
              <ion-icon slot="icon-only" src="{{ (allExpanded() ? 'chevron-up' : 'chevron-down') | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        }
        <ion-grid>
          <ion-row>
            <ion-col>
              <ion-label><strong>{{ i18n.name() }}</strong></ion-label>
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
      @if(filteredAddressesCount() === 0) {
        <bk-empty-list [message]="i18n.empty()" />
      } @else {
        @if(selectedChannel()) {
          <ion-list lines="inset">
            @for(address of filteredAddresses(); track address.bkey) {
              <ion-item (click)="showActions(address)">
                <ion-avatar slot="start">
                  <ion-img src="{{ address.parentKey | avatar }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>
                  <ion-icon src="{{ 'star' | svgIcon }}" color="{{ address.isFavorite | favoriteColor }}" />
                  @if(address.isCc) { <ion-icon src="{{ 'cc-circle' | svgIcon }}" /> }
                  @if(address.isValidated) { <ion-icon src="{{ 'shield' | svgIcon }}" /> }
                  <ion-icon [src]="getChannelIcon(address.addressChannel) | svgIcon" />
                  <span class="ion-hide-md-down"> {{ getAddressUsage(address) }}</span>
                  {{ address | formatAddress }}
                </ion-label>
                @if((address.addressChannel === 'bankaccount' || address.addressChannel === 'twint') && address.url) {
                  <ion-icon slot="end" src="{{ 'qrcode' | svgIcon }}" />
                }
              </ion-item>
            }
          </ion-list>
        } @else {
          <ion-accordion-group [multiple]="true" [value]="expandedValues()">
            @for(parentKey of parentKeys(); track parentKey) {
              <ion-accordion [value]="parentKey" toggle-icon-slot="start">
                <ion-item slot="header">
                  <ion-avatar>
                    <ion-img src="{{ parentKey | avatar }}" alt="Avatar" />
                  </ion-avatar>
                  <ion-label class="avatar">{{ getParentName(parentKey) }}</ion-label>
                </ion-item>
                <div slot="content">
                  <ion-list lines="inset">
                    @for(address of groupedAddresses().get(parentKey) ?? []; track address.bkey) {
                      <ion-item (click)="showActions(address)">
                        <ion-label class="addresses">
                          <ion-icon src="{{ 'star' | svgIcon }}" color="{{ address.isFavorite | favoriteColor }}" />
                          @if(address.isCc) { <ion-icon src="{{ 'cc-circle' | svgIcon }}" /> }
                          @if(address.isValidated) { <ion-icon src="{{ 'shield' | svgIcon }}" /> }
                          <ion-icon [src]="getChannelIcon(address.addressChannel) | svgIcon" />
                          <span class="ion-hide-md-down"> {{ getAddressUsage(address) }}</span>
                          {{ address | formatAddress }}
                        </ion-label>
                        @if((address.addressChannel === 'bankaccount' || address.addressChannel === 'twint') && address.url) {
                          <ion-icon slot="end" src="{{ 'qrcode' | svgIcon }}" />
                        }
                      </ion-item>
                    }
                  </ion-list>
                </div>
              </ion-accordion>
            }
          </ion-accordion-group>
        }
      }
    }
  </ion-content>
    `
})
export class AddressesList {
  protected readonly addressStore = inject(AddressStore);
  private actionSheetController = inject(ActionSheetController);
  private i18nService = inject(I18nService);
  private readonly alertService = inject(AlertService);

  // inputs
  // we keep this for later, but dont use it yet
  public contextMenuName = input.required<string>();

    // i18n
  protected readonly i18n = this.i18nService.translateAll({
    addresses: PFX + 'addresses',
    empty: PFX + 'nodata',
    name: PFX + 'name',
    as_title: PFX + 'actionsheet.title',
    as_edit: PFX + 'actionsheet.edit',
    as_delete: PFX + 'actionsheet.delete',
    as_copy: PFX + 'actionsheet.copy',
    as_iban_view: PFX + 'actionsheet.iban.view',
    as_iban_genqr: PFX + 'actionsheet.iban.generateQr',
    as_email_send: PFX + 'actionsheet.email.send', 
    as_phone_call: PFX + 'actionsheet.phone.call', 
    as_postal_view: PFX + 'actionsheet.postal.view', 
    as_file_view: PFX + 'actionsheet.file.view', 
    as_file_upload: PFX + 'actionsheet.file.upload', 
    as_web_open: PFX + 'actionsheet.web.open', 
    as_subject_edit: PFX + 'actionsheet.subject.edit',
    cancel: '@operation.cancel'
  });

  // derived signals
  protected addressesCount = computed(() => this.addressStore.addresses()?.length ?? 0);
  protected filteredAddresses = computed(() => this.addressStore.filteredAddresses());
  protected filteredAddressesCount = computed(() => this.filteredAddresses().length);
  protected isLoading = computed(() => this.addressStore.isLoading());
  protected tags = computed(() => this.addressStore.getTags());
  private currentUser = computed(() => this.addressStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected popupId = computed(() => 'c_addresses_' + generateRandomString(5));
  protected selectedChannel = computed(() => this.addressStore.selectedChannel());

  private imgixBaseUrl = this.addressStore.appStore.env.services.imgixBaseUrl;
  protected channels = computed(() => this.addressStore.getChannels());
  protected listHeaderName = `${PFX}list.header.name`;

  // grouping
  protected allExpanded = signal(false);
  protected parentKeys = computed(() => [...new Set(this.filteredAddresses().map(a => a.parentKey))]);
  protected groupedAddresses = computed(() => {
    const map = new Map<string, AddressModel[]>();
    for (const address of this.filteredAddresses()) {
      const group = map.get(address.parentKey) ?? [];
      group.push(address);
      map.set(address.parentKey, group);
    }
    return map;
  });
  protected expandedValues = computed(() => this.allExpanded() ? this.parentKeys() : []);

  constructor() {
    effect(() => {
        this.addressStore.setConfig('all', 'parentKey');
    })
  }
  protected toggleExpandAll(): void {
    this.allExpanded.update(v => !v);
  }

  protected getParentName(parentKey: string): string {
    const [modelType, key] = parentKey.split('.');
    if (modelType === 'person') {
      const person = this.addressStore.appStore.getPerson(key) as PersonModel | undefined;
      return person ? `${person.firstName} ${person.lastName}` : parentKey;
    }
    if (modelType === 'org') {
      const org = this.addressStore.appStore.getOrg(key) as OrgModel | undefined;
      return org?.name ?? parentKey;
    }
    return parentKey;
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.addressStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.addressStore.setSelectedTag(tag);
  }

  protected onChannelSelected(channel: string): void {
    this.addressStore.setSelectedChannel(channel);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.addressStore.add(this.readOnly()); break;
      case 'exportRaw': await this.addressStore.export("raw"); break;
      default: this.alertService.error(`AddressesList.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on an address. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param address 
   */
  protected async showActions(address: AddressModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, address);
    await this.executeActions(actionSheetOptions, address);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * We assume that the user is always at least memberAdmin, because this view is only shown in AOC.
   * @param address 
   */
  private addActionSheetButtons(options: ActionSheetOptions, address: AddressModel): void {
    if (!hasRole('memberAdmin', this.currentUser())) return;
    // on address
    options.buttons.push(createActionSheetButton('actionsheet.edit', this.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('actionsheet.delete', this.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetDivider());

    // with address (usage)
    options.buttons.push(createActionSheetButton('actionsheet.copy', this.i18n.as_copy(), this.imgixBaseUrl, 'copy'));
    switch(address.addressChannel) {
      case 'bankaccount':
        if (address.url) {
          options.buttons.push(createActionSheetButton('actionsheet.iban.view', this.i18n.as_iban_view(), this.imgixBaseUrl, 'qrcode'));
        } else {
          options.buttons.push(createActionSheetButton('actionsheet.iban.generateQr', this.i18n.as_iban_genqr(), this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case 'email':
          options.buttons.push(createActionSheetButton('actionsheet.email.send', this.i18n.as_email_send(), this.imgixBaseUrl, 'email'));
        break;
      case 'phone':
        options.buttons.push(createActionSheetButton('actionsheet.phone.call', this.i18n.as_phone_call(), this.imgixBaseUrl, 'tel'));
        break;
      case 'postal':
        options.buttons.push(createActionSheetButton('actionsheet.postal.view', this.i18n.as_postal_view(), this.imgixBaseUrl, 'location'));
        break;
      case 'twint':
        if (address.url) {
          options.buttons.push(createActionSheetButton('actionsheet.file.view', this.i18n.as_file_view(), this.imgixBaseUrl, 'document'));
        } else {
          options.buttons.push(createActionSheetButton('actionsheet.file.upload', this.i18n.as_file_upload(), this.imgixBaseUrl, 'upload'));
        }
        break;
      case 'web':
          options.buttons.push(createActionSheetButton('actionsheet.web.open', this.i18n.as_web_open(), this.imgixBaseUrl, 'link'));
        break;
    }
    options.buttons.push(createActionSheetDivider());

    // on subject
    options.buttons.push(createActionSheetButton('actionsheet.subject.edit', this.i18n.as_subject_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));
    if (options.buttons.length === 1) { // only cancel button
      options.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param address 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, address: AddressModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'address.delete':
          await this.addressStore.delete(address, false);
          break;
        case 'address.copy':
          await this.addressStore.copy(address);
          break;
        case 'address.edit':
          await this.addressStore.edit(address, false);
          break;
        case 'subject.edit':
          await this.addressStore.editSubject(address.parentKey);
          break;
        case 'address.file.view':
        case 'address.iban.view':
          await downloadToBrowser(address.url);
          break;
        case 'address.iban.generateQr':
          await this.addressStore.generateQrEzs(address);
          break;
        case 'address.email.send':
          await this.addressStore.sendEmail(address.email);
          break;
        case 'address.phone.call':
          await this.addressStore.call(address.phone);
          break;
        case 'address.postal.view':
          await this.addressStore.showPostalAddress(address);
          break;
        case 'address.file.upload':
          await this.addressStore.uploadFile(address);
          break;
        case 'address.web.open':
          await this.addressStore.openUrl(address);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.addressStore.currentUser());
  }

  protected getChannelIcon(addressChannel: string): string {
    return getCategoryIcon(this.addressStore.getChannels(), addressChannel);
  }

  protected getAddressUsage(address: AddressModel): string {
    if (address.addressUsage === 'custom') {
      return address.addressUsageLabel;
    } else {
      return `${PFX}usage.${address.addressUsage}.label`;
    }
  }

  protected async goto(parentKey: string): Promise<void> {
    const [modelType, bkey] = parentKey.split('.');
    if (!parentKey || parentKey.length === 0) return;
    if (modelType === '')
    await navigateByUrl(this.addressStore.router, `/${modelType}/${bkey}`);
  }
}

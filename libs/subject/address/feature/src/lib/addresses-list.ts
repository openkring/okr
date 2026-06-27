import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAccordionGroup, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AddressModel, OrgModel, PersonModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions, downloadToBrowser, navigateByUrl } from '@bk2/shared-util-angular';
import { generateRandomString, getCategoryIcon, hasRole } from '@bk2/shared-util-core';

import { FavoriteColorPipe, FormatAddressPipe } from '@bk2/subject-address-util';
import { AvatarPipe } from '@bk2/avatar-ui';

import { AddressStore } from './addresses.store';

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
        <ion-title>{{ filteredAddressesCount()}}/{{addressesCount()}} {{ store.i18n.addresses() }}</ion-title>
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
              <ion-label><strong>{{ store.i18n.name() }}</strong></ion-label>
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
        <bk-empty-list [message]="store.i18n.empty()" />
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
  protected readonly store = inject(AddressStore);
  private actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs
  // we keep this for later, but dont use it yet
  public contextMenuName = input.required<string>();

  // derived signals
  protected addressesCount = computed(() => this.store.addresses()?.length ?? 0);
  protected filteredAddresses = computed(() => this.store.filteredAddresses());
  protected filteredAddressesCount = computed(() => this.filteredAddresses().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  private currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected popupId = computed(() => 'c_addresses_' + generateRandomString(5));
  protected selectedChannel = computed(() => this.store.selectedChannel());

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;
  protected channels = computed(() => this.store.getChannels());
  protected listHeaderName = this.store.i18n.name();

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
        this.store.setConfig('all', 'parentKey');
    })
  }
  protected toggleExpandAll(): void {
    this.allExpanded.update(v => !v);
  }

  protected getParentName(parentKey: string): string {
    const [modelType, key] = parentKey.split('.');
    if (modelType === 'person') {
      const person = this.store.appStore.getPerson(key) as PersonModel | undefined;
      return person ? `${person.firstName} ${person.lastName}` : parentKey;
    }
    if (modelType === 'org') {
      const org = this.store.appStore.getOrg(key) as OrgModel | undefined;
      return org?.name ?? parentKey;
    }
    return parentKey;
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onChannelSelected(channel: string): void {
    this.store.setSelectedChannel(channel);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: this.alertService.error(`AddressesList.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on an address. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param address 
   */
  protected async showActions(address: AddressModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
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
    options.buttons.push(createActionSheetButton('edit', this.store.i18n.update_label(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('delete', this.store.i18n.delete_label(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetDivider());

    // with address (usage)
    options.buttons.push(createActionSheetButton('copy', this.store.i18n.copy_label(), this.imgixBaseUrl, 'copy'));
    switch(address.addressChannel) {
      case 'bankaccount':
        if (address.url) {
          options.buttons.push(createActionSheetButton('iban.view', this.store.i18n.view_iban(), this.imgixBaseUrl, 'qrcode'));
        } else {
          options.buttons.push(createActionSheetButton('iban.generateQr', this.store.i18n.generate_qrezs(), this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case 'email':
          options.buttons.push(createActionSheetButton('email.send', this.store.i18n.send_email_label(), this.imgixBaseUrl, 'email'));
        break;
      case 'phone':
        options.buttons.push(createActionSheetButton('phone.call', this.store.i18n.call_phone(), this.imgixBaseUrl, 'tel'));
        break;
      case 'postal':
        options.buttons.push(createActionSheetButton('postal.view', this.store.i18n.view_postal(), this.imgixBaseUrl, 'location'));
        break;
      case 'twint':
        if (address.url) {
          options.buttons.push(createActionSheetButton('file.view', this.store.i18n.view_file(), this.imgixBaseUrl, 'document'));
        } else {
          options.buttons.push(createActionSheetButton('file.upload', this.store.i18n.upload_file(), this.imgixBaseUrl, 'upload'));
        }
        break;
      case 'web': {
          // Open the link from the synchronous tap handler (not the post-dismiss switch) so the
          // user gesture survives — Safari blocks window.open once the ActionSheet has dismissed.
          const webButton = createActionSheetButton('web.open', this.store.i18n.open_web(), this.imgixBaseUrl, 'link');
          webButton.handler = () => { this.store.openWeb(address); };
          options.buttons.push(webButton);
        }
        break;
    }
    options.buttons.push(createActionSheetDivider());

    // on subject
    options.buttons.push(createActionSheetButton('subject.edit', this.store.i18n.update_subject(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));
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
        case 'delete':
          await this.store.delete(address, false);
          break;
        case 'copy':
          await this.store.copy(address);
          break;
        case 'edit':
          await this.store.edit(address, false);
          break;
        case 'subject.edit':
          await this.store.editSubject(address.parentKey);
          break;
        case 'file.view':
        case 'iban.view':
          await downloadToBrowser(address.url);
          break;
        case 'iban.generateQr':
          await this.store.generateQrEzs(address);
          break;
        case 'email.send':
          await this.store.sendEmail(address.email);
          break;
        case 'phone.call':
          await this.store.call(address.phone);
          break;
        case 'postal.view':
          await this.store.showPostalAddress(address);
          break;
        case 'file.upload':
          await this.store.uploadFile(address);
          break;
        // 'web.open' is handled synchronously by the button handler (Safari popup blocker).
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected getChannelIcon(addressChannel: string): string {
    return getCategoryIcon(this.store.getChannels(), addressChannel);
  }

  protected getAddressUsage(address: AddressModel): string {
    switch(address.addressUsage) {
      case 'home':    return this.store.i18n.usage_home_label();
      case 'work':    return this.store.i18n.usage_work_label();
      case 'mobile':  return this.store.i18n.usage_mobile_label();
      case 'custom':  return address.addressUsageLabel;
    }
    return '';
  }

  protected async goto(parentKey: string): Promise<void> {
    const [modelType, bkey] = parentKey.split('.');
    if (!parentKey || parentKey.length === 0) return;
    if (modelType === '')
    await navigateByUrl(this.store.router, `/${modelType}/${bkey}`);
  }
}

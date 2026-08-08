import { Component, computed, inject, input } from '@angular/core';
import {
  ActionSheetController, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon,
  IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { PartnerModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { heartbeatStatus } from '@okr/business-metering-util';

import { PartnerStore } from './partner.store';

/**
 * The partner registry (C3 §5), bkaiser-side in tenant `kring`.
 *
 * The heartbeat column is the operational point of the whole screen: C2 §13.3's notice and
 * termination right hang off an ABSENT metering push, and `checkPartnerHeartbeats` only logs —
 * deliberately, since suspending a partner is a decision, not a cron job's verdict. This list is
 * where that decision is actually seen and taken.
 */
@Component({
  selector: 'okr-partner-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, ListFilter, EmptyList, Menu,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon,
    IonContent, IonGrid, IonRow, IonCol, IonLabel, IonPopover,
  ],
  providers: [PartnerStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredPartnersCount() }}/{{ partnersCount() }} {{ store.i18n.partners() }}</ion-title>
        @if(!readOnly()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />

      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="6" size-md="5"><ion-label><strong>{{ store.i18n.list_header_name() }}</strong></ion-label></ion-col>
            <ion-col size="3"><ion-label><strong>{{ store.i18n.list_header_status() }}</strong></ion-label></ion-col>
            <ion-col size="3" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.list_header_heartbeat() }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if(isLoading()) {
        <okr-spinner />
      } @else if(filteredPartnersCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for(partner of filteredPartners(); track partner.okey) {
            <ion-row (click)="showActions(partner)">
              <ion-col size="6" size-md="5"><ion-label>{{ partner.name }}</ion-label></ion-col>
              <ion-col size="3"><ion-label>{{ partner.status }}</ion-label></ion-col>
              <ion-col size="3" class="ion-hide-md-down">
                <ion-label [color]="heartbeatColor(partner)">{{ heartbeatLabel(partner) }}</ion-label>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `,
})
export class PartnerList {
  protected readonly store = inject(PartnerStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs
  public readonly listId = input('all');
  public readonly contextMenuName = input.required<string>();

  // data
  protected readonly filteredPartners = computed(() => this.store.filteredPartners());
  protected readonly partnersCount = computed(() => this.store.partners().length);
  protected readonly filteredPartnersCount = computed(() => this.filteredPartners().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));
  protected readonly popupId = computed(() => `c_partners_${this.listId()}`);

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************* heartbeat *************************************** */
  protected heartbeatLabel(partner: PartnerModel): string {
    switch (heartbeatStatus(partner.lastHeartbeatAt)) {
      case 'notice': return this.store.i18n.heartbeat_notice();
      case 'termination-right': return this.store.i18n.heartbeat_termination();
      default: return this.store.i18n.heartbeat_ok();
    }
  }

  protected heartbeatColor(partner: PartnerModel): string {
    switch (heartbeatStatus(partner.lastHeartbeatAt)) {
      case 'notice': return 'warning';
      case 'termination-right': return 'danger';
      default: return 'medium';
    }
  }

  /******************************* actions *************************************** */
  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return;   // dismissed via backdrop/escape — not an error
    switch (selectedMethod) {
      case 'add': await this.store.add(); break;
      default: this.alertService.error(`PartnerList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(partner: PartnerModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    if (this.readOnly()) {
      options.buttons.push(createActionSheetButton('partner.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    } else {
      options.buttons.push(createActionSheetButton('partner.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('partner.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) return;   // only cancel → nothing worth presenting

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'partner.view': await this.store.edit(partner, true); break;
      case 'partner.edit': await this.store.edit(partner, false); break;
      case 'partner.delete': await this.store.delete(partner); break;
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

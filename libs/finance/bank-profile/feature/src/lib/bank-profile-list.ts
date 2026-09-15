import { Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonPopover, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { BankProfileModel } from '@okr/shared-models';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';

import { Menu } from '@okr/cms-menu-feature';

import { BankProfileStore } from './bank-profile.store';

/** IBAN formatted in groups of 4, e.g. 'CH93 0076 2011 6238 5295 7'. */
function formatIban(iban: string): string {
  return (iban ?? '').replace(/(.{4})/g, '$1 ').trim();
}

@Component({
  selector: 'okr-bank-profile-list',
  standalone: true,
  imports: [
    SvgIconPipe, Menu, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonIcon, IonPopover,
    IonContent, IonList, IonItem, IonLabel,
  ],
  providers: [BankProfileStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ store.profiles().length }} {{ store.i18n.plural() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true"
            [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content>
                <okr-menu [menuName]="contextMenuName()" />
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (store.profiles().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (profile of store.profiles(); track profile.okey) {
            <ion-item button [detail]="false" (click)="showActions(profile)">
              <ion-label>
                <h3>{{ profile.bankName }}</h3>
                <p>{{ formatIban(profile.iban) }} · {{ formatLabel(profile.format) }} · {{ profile.accountKey || '—' }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class BankProfileList {
  protected readonly store = inject(BankProfileStore);
  private readonly route = inject(ActivatedRoute);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /** Name of the DB menu document loaded into the header context menu (route `:contextMenuName`). */
  public readonly contextMenuName = input.required<string>();
  protected readonly popupId = computed(() => `c_bankprofiles_${this.contextMenuName()}`);

  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setAccountingTenant(id);
    });
  }

  protected formatIban(iban: string): string {
    return formatIban(iban);
  }

  /** Translated label for a BankFormat value (falls back to the raw enum). */
  protected formatLabel(format: string): string {
    switch (format) {
      case 'postfinance': return this.store.i18n.format_postfinance();
      case 'zkb': return this.store.i18n.format_zkb();
      case 'yuh': return this.store.i18n.format_yuh();
      case 'vz': return this.store.i18n.format_vz();
      case 'gkb': return this.store.i18n.format_gkb();
      case 'swissquote': return this.store.i18n.format_swissquote();
      default: return format;
    }
  }

  /** List-level context-menu actions (DB `okr-menu` call items whose `url` is the method name). */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.openCreate(); break;
      default: this.alertService.error(`BankProfileList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(profile: BankProfileModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options);
    await this.executeActions(options, profile);
  }

  private addActionSheetButtons(options: ActionSheetOptions): void {
    options.buttons.push(createActionSheetButton('bankProfile.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('bankProfile.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, profile: BankProfileModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'bankProfile.edit':   await this.store.openEdit(profile, false); break;
      case 'bankProfile.delete': await this.store.delete(profile); break;
    }
  }
}

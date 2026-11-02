import { Component, DestroyRef, computed, inject } from '@angular/core';
import {
  ActionSheetController, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonMenuButton, IonPopover, IonTitle, IonToolbar,
} from '@ionic/angular';
import type { ActionSheetOptions } from '@ionic/angular';

import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { FileTransferModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { contextMenuId, fill } from '@okr/shared-util-core';
import { emptyFileTransferEventSummary, formatFileTransferExpiry, formatFileTransferSize } from '@okr/content-file-transfer-util';

import { FileTransferStore } from './file-transfer.store';
import { fileTransferStateColor, fileTransferStateLabel, isFileTransferOpen } from './file-transfer-state.util';

/**
 * «Meine Transfers» — `/private/file-transfer` (spec 1.115 §4.1–4.3): the signed-in person's own
 * transfers with state, size, recipients, expiry and how often they were opened and downloaded.
 * Header: «Transfer senden» and the (i) info modal for everybody; for admins a «…» context menu
 * whose only row opens the Transfer-Überwachung. Per row: «Öffnen» and «Beenden».
 *
 * The context menu name is FIXED (`c-file-transfers`), not a `:contextMenuName` route segment:
 * `/private/file-transfer/<segment>` is already the transfer view page. The menu document's
 * `roleNeeded: 'admin'` decides whether the «…» shows (`menuItemsStore.canOpen`).
 */
@Component({
  selector: 'okr-file-transfer-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonChip, IonPopover,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.list_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="store.showInfo()" [attr.aria-label]="store.i18n.list_info()">
            <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
          </ion-button>
          <ion-button (click)="store.openNew()" [attr.aria-label]="store.i18n.list_send()">
            <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
          </ion-button>
          @if (menuItemsStore.canOpen(contextMenuName)) {
            <ion-button id="{{ popupId }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName" />
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (transfer of filtered(); track transfer.okey) {
            <ion-item button [detail]="false" (click)="showActions(transfer)">
              <ion-label class="ion-text-wrap">
                <h2>{{ title(transfer) }}</h2>
                <p>{{ size(transfer) }} · {{ recipients(transfer) }} · {{ expires(transfer) }}</p>
                <p>{{ counts(transfer) }}</p>
              </ion-label>
              <ion-chip slot="end" [color]="stateColor(transfer)">{{ stateLabel(transfer) }}</ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class FileTransferList {
  protected readonly store = inject(FileTransferStore);
  protected readonly menuItemsStore = inject(MenuItemsStore);
  /** its only row navigates (Transfer-Überwachung), so the popover needs no dismiss handler */
  protected readonly contextMenuName = 'c-file-transfers';
  protected readonly popupId = contextMenuId('c_file_transfers');
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    this.store.setSearchTerm('');
    this.store.showMine(true);
    // the store lives in root: stop the list's listeners when the screen goes away
    inject(DestroyRef).onDestroy(() => this.store.showMine(false));
  }

  protected readonly count = computed(() => this.store.mine().length);
  protected readonly filtered = computed(() => this.store.filteredMine());
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly isLoading = computed(() => this.store.isLoadingMine());

  protected title(t: FileTransferModel): string {
    return t.message || t.files.map(f => f.name).join(', ');
  }

  protected size(t: FileTransferModel): string {
    return formatFileTransferSize(t.totalBytes);
  }

  protected recipients(t: FileTransferModel): string {
    return fill(this.store.i18n.list_recipients(), { count: t.recipients.length });
  }

  protected expires(t: FileTransferModel): string {
    return fill(this.store.i18n.list_expires(), { date: formatFileTransferExpiry(t.expiresAt) });
  }

  protected counts(t: FileTransferModel): string {
    const s = this.store.mineSummaries().get(t.okey) ?? emptyFileTransferEventSummary();
    return `${fill(this.store.i18n.list_opens(), { count: s.opens })} · ${fill(this.store.i18n.list_downloads(), { count: s.downloads })}`;
  }

  protected stateLabel(t: FileTransferModel): string {
    return fileTransferStateLabel(t, this.store.i18n);
  }

  protected stateColor(t: FileTransferModel): string {
    return fileTransferStateColor(t);
  }

  /*-------------------------- actions --------------------------------*/
  protected async showActions(transfer: FileTransferModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.actions_title());
    this.addActionSheetButtons(options, transfer);
    await this.executeActions(options, transfer);
  }

  private addActionSheetButtons(options: ActionSheetOptions, transfer: FileTransferModel): void {
    if (isFileTransferOpen(transfer)) {
      options.buttons.push(createActionSheetButton('fileTransfer.open', this.store.i18n.actions_open(), this.imgixBaseUrl, 'eye-on'));
      options.buttons.push(createActionSheetButton('fileTransfer.end', this.store.i18n.actions_end(), this.imgixBaseUrl, 'stop-circle'));
      options.buttons.push(createActionSheetDivider());
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];   // only cancel → show nothing
  }

  private async executeActions(options: ActionSheetOptions, transfer: FileTransferModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'fileTransfer.open': await this.store.open(transfer); break;
      case 'fileTransfer.end': await this.store.end(transfer); break;
    }
  }
}

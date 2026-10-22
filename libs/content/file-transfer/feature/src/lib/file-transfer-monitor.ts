import { Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import {
  ActionSheetController, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonMenuButton, IonTitle, IonToolbar,
} from '@ionic/angular';
import type { ActionSheetOptions } from '@ionic/angular';

import { FileTransferModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { FileTransferFlag, fileTransferFlags, formatFileTransferExpiry, formatFileTransferSize } from '@okr/content-file-transfer-util';

import { FileTransferStore } from './file-transfer.store';
import { fileTransferStateColor, fileTransferStateLabel, isFileTransferOpen } from './file-transfer-state.util';

/**
 * Transfer-Überwachung — `/private/file-transfer-monitor`, admins only (spec 1.115 §4.6): every
 * transfer of the tenant with sender, size, members/outside counts, expiry, opens, downloads and
 * the «unusual» flags (`fileTransferFlags`). Per row: contact the sender (chat DM), the log, end.
 * Header: «Limiten bearbeiten» (app-config fileTransferLimits).
 *
 * ACCESS COUNTS ARE LOADED PER ROW, NOT BY LISTENER. The log is permanent and grows with every
 * open; one listener per row (or one over the whole tenant log) would grow with it. Counts are
 * read once per row, automatically only for transfers that are still open (a bounded set: the
 * lifetime cap), and for any other row when the admin opens its log.
 */
@Component({
  selector: 'okr-file-transfer-monitor',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonChip,
  ],
  styles: [`
    ion-chip.flag { margin-inline: 2px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.monitor_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="store.editLimits()" [attr.aria-label]="store.i18n.monitor_editLimits()">
            <ion-icon slot="icon-only" src="{{ 'settings' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.monitor_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (transfer of filtered(); track transfer.okey) {
            <ion-item button [detail]="false" (click)="showActions(transfer)">
              <ion-label class="ion-text-wrap">
                <h2>{{ transfer.senderName }}</h2>
                <p>{{ title(transfer) }}</p>
                <p>{{ size(transfer) }} · {{ members(transfer) }} · {{ outside(transfer) }} · {{ expires(transfer) }}</p>
                <p>{{ counts(transfer) }}</p>
                @for (flag of flags(transfer); track flag) {
                  <ion-chip class="flag" color="warning">{{ flagLabel(flag) }}</ion-chip>
                }
              </ion-label>
              <ion-chip slot="end" [color]="stateColor(transfer)">{{ stateLabel(transfer) }}</ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class FileTransferMonitor {
  protected readonly store = inject(FileTransferStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;
  /** transfers whose counts were requested already (a reload of the list must not re-read them) */
  private readonly requested = new Set<string>();

  constructor() {
    this.store.setSearchTerm('');
    this.store.showAll(true);
    // the store lives in root: stop the list's listeners when the screen goes away
    inject(DestroyRef).onDestroy(() => this.store.showAll(false));
    effect(() => {
      const open = this.store.all().filter(t => isFileTransferOpen(t) && !this.requested.has(t.okey));
      untracked(() => {
        for (const t of open) {
          this.requested.add(t.okey);
          void this.store.loadSummary(t);
        }
      });
    });
  }

  protected readonly count = computed(() => this.store.all().length);
  protected readonly filtered = computed(() => this.store.filteredAll());
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly isLoading = computed(() => this.store.isLoadingAll());

  protected title(t: FileTransferModel): string {
    return t.message || t.files.map(f => f.name).join(', ');
  }

  protected size(t: FileTransferModel): string {
    return formatFileTransferSize(t.totalBytes);
  }

  protected members(t: FileTransferModel): string {
    return fill(this.store.i18n.monitor_members(), { count: t.recipients.filter(r => r.kind === 'person').length });
  }

  protected outside(t: FileTransferModel): string {
    return fill(this.store.i18n.monitor_outside(), { count: t.recipients.filter(r => r.kind === 'email').length });
  }

  protected expires(t: FileTransferModel): string {
    return fill(this.store.i18n.list_expires(), { date: formatFileTransferExpiry(t.expiresAt) });
  }

  protected counts(t: FileTransferModel): string {
    const s = this.store.monitorSummaries()[t.okey];
    if (!s) return this.store.i18n.monitor_countsLater();
    return `${fill(this.store.i18n.list_opens(), { count: s.opens })} · ${fill(this.store.i18n.list_downloads(), { count: s.downloads })}`;
  }

  /** flags against the SENDER's limits (overrides included); manyDownloads only once counts are loaded */
  protected flags(t: FileTransferModel): FileTransferFlag[] {
    const s = this.store.monitorSummaries()[t.okey];
    return fileTransferFlags(t, s?.downloadsPerRecipient ?? {}, this.store.limitsOf(t.senderKey));
  }

  protected flagLabel(flag: FileTransferFlag): string {
    switch (flag) {
      case 'manyExternals': return this.store.i18n.flag_manyExternals();
      case 'nearLimit': return this.store.i18n.flag_nearLimit();
      case 'manyDownloads': return this.store.i18n.flag_manyDownloads();
      default: return flag;
    }
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
    if (transfer.senderKey) {
      options.buttons.push(createActionSheetButton('fileTransfer.contact', this.store.i18n.actions_contact(), this.imgixBaseUrl, 'chatbubbles'));
    }
    options.buttons.push(createActionSheetButton('fileTransfer.log', this.store.i18n.actions_log(), this.imgixBaseUrl, 'list'));
    if (isFileTransferOpen(transfer)) {
      options.buttons.push(createActionSheetButton('fileTransfer.end', this.store.i18n.actions_end(), this.imgixBaseUrl, 'stop-circle'));
    }
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, transfer: FileTransferModel): Promise<void> {
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'fileTransfer.contact': await this.store.contactSender(transfer); break;
      case 'fileTransfer.log': await this.store.showLog(transfer); break;
      case 'fileTransfer.end': await this.store.end(transfer); break;
    }
  }
}

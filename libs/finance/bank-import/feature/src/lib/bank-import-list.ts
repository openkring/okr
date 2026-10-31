import { Component, effect, inject, input, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import {
  ActionSheetController, ActionSheetOptions, AlertController, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid,
  IonHeader, IonIcon, IonItem, IonMenuButton, IonNote, IonPopover, IonRow, IonSelect, IonSelectOption, IonTitle, IonToolbar,
} from '@ionic/angular';

import { BankImportRowModel } from '@okr/shared-models';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, contextMenuId } from '@okr/shared-util-core';

import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';

import { BANK_IMPORT_PROVIDERS, BankImportStatusFilter, BankImportStore } from './bank-import.store';
import { AccountingBooks, AccountingSegments } from '@okr/finance-accounting-feature';

const STATUS_FILTERS: BankImportStatusFilter[] = ['open', 'all', 'unmapped', 'mapped', 'posted', 'error'];

@Component({
  selector: 'okr-bank-import-list',
  standalone: true,
  imports: [
    AccountingSegments, AccountingBooks,
    SvgIconPipe, Menu, Spinner, EmptyList, ListFilter, DecimalPipe,
    IonHeader, IonToolbar, IonButtons, IonButton, IonMenuButton, IonTitle, IonIcon, IonPopover,
    IonContent, IonGrid, IonRow, IonCol, IonChip, IonNote,
    IonSelect, IonSelectOption, IonItem,
  ],
  providers: BANK_IMPORT_PROVIDERS,
  styles: [`.medium { color: var(--ion-color-medium); } ion-note.fee { display: block; font-size: 0.8em; }`],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.filtered().length }}/{{ store.rows().length }} {{ store.i18n.plural() }}</ion-title>
        <okr-accounting-books slot="end" />
        <ion-buttons slot="end">
          @if (menuItemsStore.canOpen(contextMenuName())) {
            <ion-button id="{{ popupId }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true"
              [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      </ion-toolbar>
      <okr-accounting-segments />
      <ion-toolbar>
        <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
        <ion-item lines="none">
          <ion-select interface="popover" [value]="store.statusFilter()" (ionChange)="store.setStatusFilter($event.detail.value)">
            @for (s of statusFilters; track s) {
              <ion-select-option [value]="s">{{ statusFilterLabel(s) }}</ion-select-option>
            }
          </ion-select>
          <ion-select interface="popover" [value]="store.profileFilter()" (ionChange)="store.setProfileFilter($event.detail.value)">
            <ion-select-option value="">—</ion-select-option>
            @for (p of store.profiles(); track p.okey) {
              <ion-select-option [value]="p.okey">{{ p.bankName }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-toolbar>
      <ion-toolbar color="primary" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="2">{{ store.i18n.header_date() }}</ion-col>
            <ion-col size="4">{{ store.i18n.header_title() }}</ion-col>
            <ion-col size="3">{{ store.i18n.header_payee() }}</ion-col>
            <ion-col size="3">{{ store.i18n.header_amount() }}</ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (store.rows().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for (row of store.filtered(); track row.okey) {
            <ion-row (click)="showActions(row)">
              <ion-col size="12" size-md="2">{{ dateLabel(row.date) }}</ion-col>
              <ion-col size="12" size-md="4" [class.medium]="row.status === 'unmapped'">{{ row.title || row.rawText }}</ion-col>
              <ion-col size="12" size-md="3" class="ion-hide-md-down">{{ row.payee }}</ion-col>
              <ion-col size="12" size-md="3" class="ion-text-end" [style.color]="row.amount.amount < 0 ? 'var(--ion-color-danger)' : null">
                {{ row.amount.amount / 100 | number:'1.2-2' }} {{ row.amount.currency }}
                @if (row.fee.amount) {
                  <!-- gross stays the headline; the processor fee and what actually arrives read underneath -->
                  <ion-note class="fee">./. {{ store.i18n.fee_label() }} {{ row.fee!.amount / 100 | number:'1.2-2' }}
                    → {{ store.i18n.fee_net_label() }} {{ (row.amount.amount - row.fee!.amount) / 100 | number:'1.2-2' }}</ion-note>
                }
                <ion-chip>{{ statusLabel(row.status) }}</ion-chip>
                @if (row.invoiceKey) {
                  <ion-chip color="success">{{ store.i18n.invoice_chip() }}</ion-chip>
                }
                @if (row.billKey) {
                  <ion-chip color="success">{{ store.i18n.bill_chip() }}</ion-chip>
                }
                @if (row.status === 'error') {
                  <ion-note color="danger">{{ store.errorText(row.error) }}</ion-note>
                }
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `,
})
export class BankImportList {
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly store = inject(BankImportStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);
  private readonly alertService = inject(AlertService);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected readonly statusFilters = STATUS_FILTERS;

  /** Name of the DB menu document loaded into the header context menu (route `:contextMenuName`). */
  public readonly contextMenuName = input.required<string>();
  /** quick action from the accounting overview (spec 1.100 §4.4), e.g. ?action=add */
  public readonly action = input<string | undefined>();
  // Unique per instance: Ionic keeps the previous page in the DOM, so a fixed id (same for scs and gss books)
  // binds the popover of the next page to the hidden button of the previous one.
  protected readonly popupId = contextMenuId('c_bankimport');

  constructor() {
    effect(() => {
      const action = this.action();
      if (!action) return;
      untracked(() => void this.runQuickAction(action));
    });
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setAccountingTenant(id);
    });
  }

  protected dateLabel(date: string): string {
    return convertDateFormatToString(date, DateFormat.StoreDate, DateFormat.ViewDate);
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'unmapped': return this.store.i18n.status_unmapped();
      case 'mapped': return this.store.i18n.status_mapped();
      case 'posted': return this.store.i18n.status_posted();
      case 'error': return this.store.i18n.status_error();
      default: return status;
    }
  }

  protected statusFilterLabel(filter: BankImportStatusFilter): string {
    switch (filter) {
      case 'open': return this.store.i18n.status_open();
      case 'all': return this.store.i18n.status_all();
      case 'unmapped': return this.store.i18n.status_unmapped();
      case 'mapped': return this.store.i18n.status_mapped();
      case 'posted': return this.store.i18n.status_posted();
      case 'error': return this.store.i18n.status_error();
      default: return filter;
    }
  }

  /** runs the quick action from the accounting overview, after dropping it from the url (spec 1.100 §4.4) */
  private async runQuickAction(action: string): Promise<void> {
    await this.router.navigate([], { queryParams: { action: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (this.store.accountingStore.isExternallyManaged()) return;
    switch (action) {
      case 'import': await this.offerImport(); break;
    }
  }

  /**
   * The quick action runs long after the user's tap (navigation, lazy load), and Safari/iOS refuse a file
   * dialog outside a gesture. So ask once: the button's tap is a fresh gesture, and its handler calls
   * importFiles() synchronously (pickMultipleFiles() opens the dialog before the first await).
   */
  private async offerImport(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.store.i18n.import_file(),
      buttons: [
        { text: this.store.i18n.cancel(), role: 'cancel' },
        { text: this.store.i18n.import_choose(), handler: () => { void this.store.importFiles(); } },
      ],
    });
    await alert.present();
  }

  /** List-level context-menu actions (DB `okr-menu` call items whose `url` is the method name). */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'import': await this.store.importFiles(); break;
      case 'applyRules': await this.store.applyRulesToOpenRows(); break;
      case 'post': await this.store.post(); break;
      default: this.alertService.error(`BankImportList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(row: BankImportRowModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, row);
    await this.executeActions(options, row);
  }

  private addActionSheetButtons(options: ActionSheetOptions, row: BankImportRowModel): void {
    switch (row.status) {
      case 'unmapped':
        options.buttons.push(
          createActionSheetButton('bankImport.createRule', this.store.i18n.as_create_rule(), this.imgixBaseUrl, 'add'),
          createActionSheetButton('bankImport.assign', this.store.i18n.as_assign(), this.imgixBaseUrl, 'link'),
          createActionSheetDivider(),
          createActionSheetButton('bankImport.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'),
        );
        break;
      case 'mapped':
      case 'error':
        options.buttons.push(
          createActionSheetButton('bankImport.assign', this.store.i18n.as_assign(), this.imgixBaseUrl, 'link'),
          createActionSheetDivider(),
          createActionSheetButton('bankImport.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'),
        );
        break;
      case 'posted':
        options.buttons.push(createActionSheetButton('bankImport.openBooking', this.store.i18n.as_open_booking(), this.imgixBaseUrl, 'open'));
        break;
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];   // only cancel → show nothing
  }

  private async executeActions(options: ActionSheetOptions, row: BankImportRowModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'bankImport.createRule':   await this.store.createRuleFrom(row); break;
      case 'bankImport.assign':       await this.store.assign(row); break;
      case 'bankImport.delete':       await this.store.deleteRow(row); break;
      case 'bankImport.openBooking':  await this.store.openBooking(row); break;
    }
  }
}

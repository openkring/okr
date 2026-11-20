import { Component, computed, effect, inject, input } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon,
  IonLabel, IonMenuButton, IonPopover, IonRow, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
} from '@ionic/angular';

import { AvatarPipe } from '@okr/avatar-ui';
import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { AccountingBooks } from '@okr/finance-accounting-feature';
import { monthTitleDe, TrainerInvoiceAction, trainerInvoiceActions, trainerInvoiceStateColor } from '@okr/finance-trainer-billing-util';
import { TrainerAgreementModel, TrainerInvoiceModel, TrainerInvoiceState } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, formatMinorAmount, ImgDirective, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { contextMenuId, convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { TrainerAgreementStore, TrainerSegment } from './trainer-agreement.store';

/** The icon of each invoice action in the ActionSheet. */
const INVOICE_ACTION_ICONS: Record<TrainerInvoiceAction, string> = {
  download: 'download',
  toBill: 'invoice',
  reject: 'thumbs-down',
  markPaid: 'checkmark',
};

/**
 * The treasurer's page «Trainer» (spec 1.167 §7.1, §7.5): the agreements and the trainer invoices of the books of the
 * route, one segment each. Route: `accounting/:accountingTenantId/trainers/:listId/:contextMenuName` (treasurer, via the
 * accounting shell). `listId` is 'all' or the personKey of one trainer.
 */
@Component({
  selector: 'okr-trainer-agreement-list',
  standalone: true,
  providers: [TrainerAgreementStore],
  imports: [
    AccountingBooks, Menu, AvatarPipe, SvgIconPipe, ImgDirective, Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover, IonSegment, IonSegmentButton,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonAvatar, IonChip,
  ],
  styles: [`
    .amount { text-align: right; }
    .state { text-align: right; }
    ion-chip { font-size: 0.8rem; padding-top: 0px; padding-bottom: 0px; height: 12px; }
    ion-avatar { height: 30px; width: 30px; background-color: var(--ion-color-light); }
    ion-row { cursor: pointer; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ count() }} {{ store.i18n.trainers_title() }}</ion-title>
        <okr-accounting-books slot="end" />
        <ion-buttons slot="end">
          @if (menuItemsStore.canOpen(contextMenuName())) {
            <ion-button id="{{ popupId }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
              (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="store.segment()" (ionChange)="onSegmentChange($event)">
          <ion-segment-button value="agreements"><ion-label>{{ store.i18n.trainers_segment_agreements() }}</ion-label></ion-segment-button>
          <ion-segment-button value="invoices"><ion-label>{{ store.i18n.trainers_segment_invoices() }}</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
      <ion-toolbar color="primary">
        <ion-grid>
          @if (store.segment() === 'agreements') {
            <ion-row>
              <ion-col size="8" size-md="5"><ion-label><strong>{{ store.i18n.trainers_col_person() }}</strong></ion-label></ion-col>
              <ion-col size="3" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.trainers_col_validity() }}</strong></ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.trainers_col_services() }}</strong></ion-label></ion-col>
              <ion-col size="4" size-md="2" class="state"><ion-label><strong>{{ store.i18n.trainers_col_state() }}</strong></ion-label></ion-col>
            </ion-row>
          } @else {
            <ion-row>
              <ion-col size="3" size-md="2"><ion-label><strong>{{ store.i18n.trainers_col_month() }}</strong></ion-label></ion-col>
              <ion-col size="4" size-md="4"><ion-label><strong>{{ store.i18n.trainers_col_person() }}</strong></ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.trainers_col_number() }}</strong></ion-label></ion-col>
              <ion-col size="2" class="amount"><ion-label><strong>{{ store.i18n.trainers_col_total() }}</strong></ion-label></ion-col>
              <ion-col size="3" size-md="2" class="state"><ion-label><strong>{{ store.i18n.trainers_col_state() }}</strong></ion-label></ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (store.segment() === 'agreements') {
        @if (store.filteredAgreements().length === 0) {
          <okr-empty-list [message]="store.i18n.trainers_empty_agreements()" />
        } @else {
          <ion-grid>
            @for (agreement of store.filteredAgreements(); track agreement.okey) {
              <ion-row (click)="showAgreementActions(agreement)">
                <ion-col size="2" size-md="1">
                  @if (agreement.person; as person) {
                    <ion-avatar>
                      <img okrImg src="{{ 'person.' + person.key | avatar:'person' }}" alt="Avatar" />
                    </ion-avatar>
                  }
                </ion-col>
                <ion-col size="6" size-md="4" class="ion-align-self-center"><ion-label>{{ personName(agreement) }}</ion-label></ion-col>
                <ion-col size="3" class="ion-hide-md-down ion-align-self-center">{{ validity(agreement) }}</ion-col>
                <ion-col size="2" class="ion-hide-md-down ion-align-self-center">{{ (agreement.services ?? []).length }}</ion-col>
                <ion-col size="4" size-md="2" class="state ion-align-self-center">
                  @if (store.isActive(agreement)) {
                    <ion-chip [outline]="true" color="success">{{ store.i18n.trainers_active() }}</ion-chip>
                  } @else {
                    <ion-chip [outline]="true" color="medium">{{ store.i18n.trainers_inactive() }}</ion-chip>
                  }
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        }
      } @else {
        @if (store.filteredInvoices().length === 0) {
          <okr-empty-list [message]="store.i18n.trainers_empty_invoices()" />
        } @else {
          <ion-grid>
            @for (invoice of store.filteredInvoices(); track invoice.okey) {
              <ion-row (click)="showInvoiceActions(invoice)">
                <ion-col size="3" size-md="2" class="ion-align-self-center">{{ monthTitle(invoice.month) }}</ion-col>
                <ion-col size="4" size-md="4" class="ion-align-self-center">{{ store.trainerName(invoice) }}</ion-col>
                <ion-col size="2" class="ion-hide-md-down ion-align-self-center">{{ invoice.invoiceNo }}</ion-col>
                <ion-col size="2" class="amount ion-align-self-center">{{ amount(invoice.total) }}</ion-col>
                <ion-col size="3" size-md="2" class="state ion-align-self-center">
                  <ion-chip [outline]="true" [color]="stateColor(invoice.state)">{{ stateLabel(invoice.state) }}</ion-chip>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        }
      }
    </ion-content>
  `,
})
export class TrainerAgreementList {
  protected readonly store = inject(TrainerAgreementStore);
  protected readonly menuItemsStore = inject(MenuItemsStore);
  private readonly actionSheetController = inject(ActionSheetController);

  // inputs (route binding)
  public readonly listId = input('all');
  public readonly contextMenuName = input.required<string>();

  // Unique per instance: Ionic keeps the previous page in the DOM (menu skill, «…» button).
  protected readonly popupId = contextMenuId('c_trainers');
  protected readonly count = computed(() =>
    this.store.segment() === 'agreements' ? this.store.filteredAgreements().length : this.store.filteredInvoices().length);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setListId(this.listId()));
  }

  /******************************** getters ******************************************* */
  protected personName(agreement: TrainerAgreementModel): string {
    return `${agreement.person?.name1 ?? ''} ${agreement.person?.name2 ?? ''}`.trim();
  }

  /** `01.08.2026 – 31.07.2027`, or `01.08.2026 – offen` without an end. */
  protected validity(agreement: TrainerAgreementModel): string {
    const from = this.viewDate(agreement.validFrom);
    const to = agreement.validTo ? this.viewDate(agreement.validTo) : this.store.i18n.trainers_validity_open();
    return `${from} – ${to}`;
  }

  protected monthTitle(month: string): string {
    return month ? monthTitleDe(month) : '';
  }

  protected amount(rappen: number | undefined): string {
    return formatMinorAmount(rappen ?? 0);
  }

  protected stateColor(state: TrainerInvoiceState): string {
    return trainerInvoiceStateColor(state);
  }

  protected stateLabel(state: TrainerInvoiceState): string {
    switch (state) {
      case 'sent': return this.store.i18n.trainers_state_sent();
      case 'booked': return this.store.i18n.trainers_state_booked();
      case 'paid': return this.store.i18n.trainers_state_paid();
      case 'rejected': return this.store.i18n.trainers_state_rejected();
      default: return state ?? '';
    }
  }

  private viewDate(storeDate: string): string {
    return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) : '';
  }

  /******************************** actions ******************************************* */
  protected onSegmentChange($event: CustomEvent): void {
    const value = $event.detail.value as TrainerSegment;
    if (value === 'agreements' || value === 'invoices') this.store.setSegment(value);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without a choice (backdrop/escape)
    switch (selectedMethod) {
      case 'add': await this.store.add(); break;
      default: error(undefined, `TrainerAgreementList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showAgreementActions(agreement: TrainerAgreementModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.trainers_as_agreement());
    options.buttons.push(createActionSheetButton('agreement.edit', this.store.i18n.trainers_action_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('agreement.archive', this.store.i18n.trainers_action_archive(), this.imgixBaseUrl, 'archive'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.trainers_action_cancel(), this.imgixBaseUrl, 'cancel'));
    switch (await this.present(options)) {
      case 'agreement.edit': await this.store.edit({ ...agreement }); break;
      case 'agreement.archive': await this.store.archive(agreement); break;
    }
  }

  protected async showInvoiceActions(invoice: TrainerInvoiceModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.trainers_as_invoice());
    const labels: Record<TrainerInvoiceAction, string> = {
      download: this.store.i18n.trainers_action_download(),
      toBill: this.store.i18n.trainers_action_toBill(),
      reject: this.store.i18n.trainers_action_reject(),
      markPaid: this.store.i18n.trainers_action_markPaid(),
    };
    for (const action of trainerInvoiceActions(invoice, this.store.backend())) {
      options.buttons.push(createActionSheetButton(`invoice.${action}`, labels[action], this.imgixBaseUrl, INVOICE_ACTION_ICONS[action]));
    }
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.trainers_action_cancel(), this.imgixBaseUrl, 'cancel'));
    switch (await this.present(options)) {
      case 'invoice.download': await this.store.download(invoice); break;
      case 'invoice.toBill': await this.store.toBill(invoice); break;
      case 'invoice.reject': await this.store.reject(invoice); break;
      case 'invoice.markPaid': await this.store.markPaid(invoice); break;
    }
  }

  /** Present the sheet; the chosen action, or undefined (only «Abbrechen» left → nothing is shown). */
  private async present(options: ActionSheetOptions): Promise<string | undefined> {
    if (options.buttons.length <= 2) return undefined; // divider + cancel only
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    return data?.action;
  }
}

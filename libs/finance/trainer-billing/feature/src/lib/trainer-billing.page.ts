import { Component, inject } from '@angular/core';
import {
  ActionSheetController, IonButton, IonButtons, IonChip, IonCol, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonItem,
  IonLabel, IonList, IonListHeader, IonMenuButton, IonRow, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
} from '@ionic/angular';

import { monthTitleDe, trainerInvoiceStateColor } from '@okr/finance-trainer-billing-util';
import { TrainerInvoiceModel, TrainerInvoiceState, WorkEntryModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';

import { TrainerBillingStore } from './trainer-billing.store';

/**
 * The trainer's page «Meine Abrechnung» (spec 1.167 §7.2–§7.4), route `/trainer-billing/me` (any member). One month at
 * a time: the trainer records work («Einsatz hinzufügen»), edits or deletes open entries, previews the invoice and sends
 * it to the treasurer. Below, «Meine Rechnungen» with their state and PDF. No amounts here — the preview PDF has them.
 */
@Component({
  selector: 'okr-trainer-billing-page',
  standalone: true,
  providers: [TrainerBillingStore],
  imports: [
    SvgIconPipe, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonSegment, IonSegmentButton, IonContent,
    IonFooter, IonLabel, IonGrid, IonRow, IonCol, IonChip, IonList, IonListHeader, IonItem,
  ],
  styles: [`
    .month { text-align: center; font-weight: 600; }
    .quantity, .state { text-align: right; }
    ion-chip { font-size: 0.8rem; padding-top: 0px; padding-bottom: 0px; height: 12px; }
    ion-row.entry { cursor: pointer; }
    .reason { white-space: normal; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.me_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="store.editProfile()" [disabled]="store.busy()">
            <ion-icon slot="start" src="{{ 'person' | svgIcon }}" />
            {{ store.i18n.me_profile() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="store.previousMonth()" [attr.aria-label]="store.i18n.me_month_prev()">
            <ion-icon slot="icon-only" src="{{ 'chevron-back' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
        <div class="month">{{ store.monthTitle() }}</div>
        <ion-buttons slot="end">
          <ion-button (click)="store.nextMonth()" [disabled]="!store.canGoNext()" [attr.aria-label]="store.i18n.me_month_next()">
            <ion-icon slot="icon-only" src="{{ 'chevron-forward' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      @if (store.booksList().length > 1) {
        <ion-toolbar>
          <ion-segment [value]="store.selectedBooks()" (ionChange)="onBooksChange($event)">
            @for (books of store.booksList(); track books) {
              <ion-segment-button [value]="books"><ion-label>{{ store.booksLabels()[books] || books }}</ion-label></ion-segment-button>
            }
          </ion-segment>
        </ion-toolbar>
      }
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else {
        @if (!store.hasActiveAgreement()) {
          <okr-empty-list [message]="store.i18n.me_empty_agreement()" />
        } @else {
          <ion-list-header>
            <ion-label>{{ store.i18n.me_entries_title() }}</ion-label>
            @if (store.agreement()) {
              <ion-button (click)="store.addEntry()" [disabled]="store.busy()">
                <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                {{ store.i18n.me_entry_add() }}
              </ion-button>
            }
          </ion-list-header>
          @if (!store.agreement()) {
            <okr-empty-list [message]="store.i18n.me_empty_month()" />
          } @else if (store.entries().length === 0) {
            <okr-empty-list [message]="store.i18n.me_empty_entries()" />
          } @else {
            <ion-grid>
              <ion-row>
                <ion-col size="3" size-md="2"><ion-label><strong>{{ store.i18n.me_col_date() }}</strong></ion-label></ion-col>
                <ion-col size="5" size-md="4"><ion-label><strong>{{ store.i18n.me_col_text() }}</strong></ion-label></ion-col>
                <ion-col size="3" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.me_col_service() }}</strong></ion-label></ion-col>
                <ion-col size="2" size-md="1" class="quantity"><ion-label><strong>{{ store.i18n.me_col_quantity() }}</strong></ion-label></ion-col>
                <ion-col size="2" class="state"><ion-label><strong>{{ store.i18n.me_col_state() }}</strong></ion-label></ion-col>
              </ion-row>
              @for (entry of store.entries(); track entry.okey) {
                <ion-row class="entry" (click)="showEntryActions(entry)">
                  <ion-col size="3" size-md="2" class="ion-align-self-center">{{ store.viewDate(entry.date) }}</ion-col>
                  <ion-col size="5" size-md="4" class="ion-align-self-center">{{ store.entryText(entry) }}</ion-col>
                  <ion-col size="3" class="ion-hide-md-down ion-align-self-center">{{ store.serviceName(entry) }}</ion-col>
                  <ion-col size="2" size-md="1" class="quantity ion-align-self-center">{{ store.quantityText(entry) }}</ion-col>
                  <ion-col size="2" class="state ion-align-self-center">
                    @if (isOpen(entry)) {
                      <ion-chip [outline]="true" color="warning">{{ store.i18n.me_entry_open() }}</ion-chip>
                    } @else {
                      <ion-chip [outline]="true" color="success">{{ store.i18n.me_entry_invoiced() }}</ion-chip>
                    }
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          }
        }

        <ion-list-header><ion-label>{{ store.i18n.me_invoices_title() }}</ion-label></ion-list-header>
        @if (store.invoices().length === 0) {
          <okr-empty-list [message]="store.i18n.me_empty_invoices()" />
        } @else {
          <ion-list lines="inset">
            @for (invoice of store.invoices(); track invoice.okey) {
              <ion-item>
                <ion-label>
                  <h3>{{ monthTitle(invoice.month) }} · {{ invoice.invoiceNo }}</h3>
                  @if (store.showInvoiceBooks()) {
                    <p>{{ store.booksLabels()[invoice.accountingTenantId] || invoice.accountingTenantId }}</p>
                  }
                  @if (invoice.state === 'rejected' && invoice.rejectedReason) {
                    <p class="reason">{{ rejectedText(invoice) }}</p>
                  }
                </ion-label>
                <ion-chip slot="end" [outline]="true" [color]="stateColor(invoice.state)">{{ stateLabel(invoice.state) }}</ion-chip>
                @if (invoice.documentKey) {
                  <ion-button slot="end" fill="clear" (click)="store.download(invoice)" [disabled]="store.busy()"
                    [attr.aria-label]="store.i18n.trainers_action_download()">
                    <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
                  </ion-button>
                }
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>

    @if (store.agreement()) {
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button (click)="store.preview()" [disabled]="store.busy() || store.openEntries().length === 0">
              <ion-icon slot="start" src="{{ 'document' | svgIcon }}" />
              {{ store.i18n.me_preview() }}
            </ion-button>
          </ion-buttons>
          <ion-buttons slot="end">
            <ion-button fill="solid" color="primary" (click)="store.send()" [disabled]="store.busy() || store.openEntries().length === 0">
              <ion-icon slot="start" src="{{ 'send' | svgIcon }}" />
              {{ store.i18n.me_send() }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-footer>
    }
  `,
})
export class TrainerBillingPage {
  protected readonly store = inject(TrainerBillingStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /** Coming back from the person's profile (after «Adresse erfassen»): re-offer the kept «Rechnungsangaben». */
  public ionViewDidEnter(): void {
    if (this.store.profileDraft()) void this.store.editProfile();
  }

  /******************************** getters ******************************************* */
  protected isOpen(entry: WorkEntryModel): boolean {
    return (entry.state ?? 'open') === 'open';
  }

  protected monthTitle(month: string): string {
    return month ? monthTitleDe(month) : '';
  }

  protected rejectedText(invoice: TrainerInvoiceModel): string {
    return fill(this.store.i18n.me_rejected_reason(), { reason: invoice.rejectedReason ?? '' });
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

  /******************************** actions ******************************************* */
  protected onBooksChange($event: CustomEvent): void {
    const value = $event.detail.value;
    if (typeof value === 'string') this.store.setBooks(value);
  }

  /** An open entry: bearbeiten, löschen. An invoiced one opens read-only (the rules freeze it). */
  protected async showEntryActions(entry: WorkEntryModel): Promise<void> {
    if (this.store.busy()) return;
    if (!this.isOpen(entry)) {
      await this.store.editEntry({ ...entry });
      return;
    }
    const options = createActionSheetOptions(this.store.i18n.me_as_entry());
    options.buttons.push(createActionSheetButton('entry.edit', this.store.i18n.trainers_action_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('entry.delete', this.store.i18n.me_action_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.trainers_action_cancel(), this.imgixBaseUrl, 'cancel'));
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    switch (data?.action) {
      case 'entry.edit': await this.store.editEntry({ ...entry }); break;
      case 'entry.delete': await this.store.deleteEntry(entry); break;
    }
  }
}

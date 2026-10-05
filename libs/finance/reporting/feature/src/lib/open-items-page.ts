import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonHeader, IonIcon,
  IonInput, IonItem, IonLabel, IonList, IonListHeader, IonMenuButton, IonNote, IonRow, IonText, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { formatMinorAmount, Spinner } from '@okr/shared-ui';
import { convertDateFormatToString, DateFormat, fill } from '@okr/shared-util-core';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';
import { OpenItemsResult } from '@okr/finance-reporting-util';

import { OpenItemsStore } from './open-items.store';

/**
 * Offene Posten (spec 1.86): per side (Kreditoren, Debitoren) the open documents at the cut-off, the
 * account balance and their difference; when they differ, the bookings and documents that explain it.
 * Rows open the booking in the journal or the document in its list, where payments are linked.
 */
@Component({
  selector: 'okr-open-items-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe, Spinner, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonButton, IonMenuButton, IonTitle, IonIcon, IonContent, IonInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonText,
  ],
  providers: [OpenItemsStore],
  styles: [`
    .figure { font-size: 1.2rem; font-weight: 600; }
    .figure-label { font-size: 0.8rem; color: var(--ion-color-medium); }
    ion-list-header { font-size: 0.9rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.open_items_title() }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-item lines="none">
          <ion-input type="date" labelPlacement="start" [label]="store.i18n.open_items_cutoff()"
            [value]="isoCutoff()" (ionChange)="onCutoffChange($event)" />
          <ion-note slot="end">{{ scopeLabel() }}</ion-note>
        </ion-item>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <okr-read-only-banner [message]="store.i18n.open_items_external()" />
      @if (store.isExternallyManaged()) {
        <!-- bexio-managed books: the banner says why there is nothing here -->
      } @else if (store.isLoading()) {
        <okr-spinner />
      } @else {
        @for (result of [store.payables(), store.receivables()]; track result.side) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ result.side === 'payables' ? store.i18n.open_items_payables() : store.i18n.open_items_receivables() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @if (!result.configured) {
                <ion-text color="medium">{{ store.i18n.open_items_not_configured() }}</ion-text>
              } @else {
                <ion-grid>
                  <ion-row>
                    <ion-col size="4">
                      <div class="figure-label">{{ store.i18n.open_items_open_total() }}</div>
                      <div class="figure">{{ amount(result.openTotal) }}</div>
                    </ion-col>
                    <ion-col size="4">
                      <div class="figure-label">{{ store.i18n.open_items_balance() }}</div>
                      <div class="figure">{{ amount(result.balance) }}</div>
                    </ion-col>
                    <ion-col size="4">
                      <div class="figure-label">{{ store.i18n.open_items_difference() }}</div>
                      <ion-text class="figure" [color]="result.difference === 0 ? 'success' : 'warning'">{{ amount(result.difference) }}</ion-text>
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col>
                      <ion-text color="medium">{{ documentsLabel(result) }}</ion-text>
                      @if (result.difference === 0) {
                        <ion-text color="success"> · {{ store.i18n.open_items_reconciled() }}</ion-text>
                      }
                    </ion-col>
                    @if (result.documents.length > 0) {
                      <ion-col size="auto">
                        <ion-button fill="clear" size="small" (click)="store.exportCsv(result.side)">
                          <ion-icon slot="start" src="{{ 'download' | svgIcon }}" />
                          {{ store.i18n.open_items_export() }}
                        </ion-button>
                      </ion-col>
                    }
                  </ion-row>
                </ion-grid>

                @if (result.difference !== 0) {
                  @if (result.unclaimedPayments.length > 0) {
                    <ion-list>
                      <ion-list-header>{{ store.i18n.open_items_unclaimed_payments() }}</ion-list-header>
                      @for (row of result.unclaimedPayments; track row.bookingKey) {
                        <ion-item button (click)="store.openJournal(row.bookingKey, row.date)">
                          <ion-label>{{ store.viewDate(row.date) }} · {{ row.bookingNo || '' }} {{ row.title }}</ion-label>
                          <ion-note slot="end">{{ amount(row.amount) }}</ion-note>
                        </ion-item>
                      }
                    </ion-list>
                  }
                  @if (result.unclaimedCharges.length > 0) {
                    <ion-list>
                      <ion-list-header>{{ store.i18n.open_items_unclaimed_charges() }}</ion-list-header>
                      @for (row of result.unclaimedCharges; track row.bookingKey) {
                        <ion-item button (click)="store.openJournal(row.bookingKey, row.date)">
                          <ion-label>{{ store.viewDate(row.date) }} · {{ row.bookingNo || '' }} {{ row.title }}</ion-label>
                          <ion-note slot="end">{{ amount(row.amount) }}</ion-note>
                        </ion-item>
                      }
                    </ion-list>
                  }
                  @if (result.openWithoutBooking.length > 0) {
                    <ion-list>
                      <ion-list-header>{{ store.i18n.open_items_open_without_booking() }}</ion-list-header>
                      @for (doc of result.openWithoutBooking; track doc.key) {
                        <ion-item button (click)="store.openDocument(doc)">
                          <ion-label>{{ store.viewDate(doc.date) }} · {{ doc.label }}</ion-label>
                          <ion-note slot="end">{{ amount(doc.openAmount) }}</ion-note>
                        </ion-item>
                      }
                    </ion-list>
                  }
                  @if (result.carriedForward !== 0) {
                    <ion-list>
                      <ion-item lines="none">
                        <ion-label>{{ carriedLabel(result) }}</ion-label>
                        <ion-note slot="end">{{ amount(result.carriedForward) }}</ion-note>
                      </ion-item>
                    </ion-list>
                  }
                }
              }
            </ion-card-content>
          </ion-card>
        }
      }
    </ion-content>
  `,
})
export class OpenItemsPage {
  protected readonly store = inject(OpenItemsStore);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setAccountingTenant(id);
    });
  }

  protected isoCutoff(): string {
    return convertDateFormatToString(this.store.cutoff(), DateFormat.StoreDate, DateFormat.IsoDate, false) || '';
  }

  protected onCutoffChange(event: CustomEvent): void {
    const iso = String(event.detail?.value ?? '');
    this.store.setCutoff(convertDateFormatToString(iso, DateFormat.IsoDate, DateFormat.StoreDate, false) || '');
  }

  protected scopeLabel(): string {
    return fill(this.store.i18n.open_items_scope(), { date: this.store.viewDate(this.store.start()) });
  }

  protected documentsLabel(result: OpenItemsResult): string {
    return fill(this.store.i18n.open_items_documents(), { count: result.documents.length });
  }

  protected carriedLabel(result: OpenItemsResult): string {
    return fill(this.store.i18n.open_items_carried_forward(), { date: this.store.viewDate(result.start) });
  }

  protected amount(rappen: number): string {
    return formatMinorAmount(rappen);
  }
}

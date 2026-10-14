import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonItem, IonMenuButton, IonNote, IonRow,
  IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';

import { AccountingBooks, AccountingSegments } from '@okr/finance-accounting-feature';

import { AssetStore } from './asset.store';

function chf(minor: number): string {
  return (minor / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * «Abschreibungen» (spec 1.103): one fiscal year at a time. Per asset its book value at the start, the
 * year's depreciation and the book value at the end; a booked year shows its booking, an open year with
 * amounts offers «Abschreibungen {year} buchen» — booked by the `postDepreciation` function.
 */
@Component({
  selector: 'okr-depreciation-run-page',
  standalone: true,
  imports: [AccountingSegments, AccountingBooks, IonHeader, IonButtons, IonMenuButton, IonToolbar, IonTitle, IonContent,
    IonItem, IonSelect, IonSelectOption, IonGrid, IonRow, IonCol, IonNote, IonButton, IonSpinner],
  // the page is a route target of its own (not a child of AssetList), so it must provide the store itself
  providers: [AssetStore],
  styles: [`
    .explain { padding: 12px 16px 0; color: var(--ion-color-medium-shade); }
    .head { font-weight: 600; color: var(--ion-color-medium-shade); border-bottom: 1px solid var(--ion-color-light-shade); }
    .num { text-align: end; font-variant-numeric: tabular-nums; }
    .total { font-weight: 600; border-top: 1px solid var(--ion-color-light-shade); }
    .actions { padding: 16px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.deduction_run() }}</ion-title>
        <okr-accounting-books slot="end" />
      </ion-toolbar>
      <okr-accounting-segments />
    </ion-header>
    <ion-content>
      <p class="explain">{{ store.i18n.run_explain() }}</p>
      <ion-item>
        <ion-select interface="popover" [label]="store.i18n.run_year()" [value]="store.year()" (ionChange)="store.selectYear(+$event.detail.value)">
          @for (y of store.yearOptions(); track y) { <ion-select-option [value]="y">{{ y }}</ion-select-option> }
        </ion-select>
      </ion-item>

      @if (store.isLoading()) {
        <div class="ion-text-center ion-padding"><ion-spinner name="dots" /></div>
      } @else if (store.plan().length === 0) {
        <p class="ion-padding">{{ store.i18n.run_empty() }}</p>
      } @else {
        <ion-grid>
          <ion-row class="head">
            <ion-col size="12" size-md="4">{{ store.i18n.run_asset() }}</ion-col>
            <ion-col size="4" size-md="2" class="num">{{ store.i18n.run_bookValueStart() }}</ion-col>
            <ion-col size="4" size-md="2" class="num">{{ store.i18n.run_amount() }}</ion-col>
            <ion-col size="4" size-md="2" class="num">{{ store.i18n.run_bookValueEnd() }}</ion-col>
            <ion-col size-md="2" class="ion-hide-md-down"></ion-col>
          </ion-row>
          @for (row of store.plan(); track row.assetKey) {
            <ion-row>
              <ion-col size="12" size-md="4">{{ row.assetNo }} {{ row.name }}</ion-col>
              <ion-col size="4" size-md="2" class="num">{{ money(row.bookValueStart) }}</ion-col>
              <ion-col size="4" size-md="2" class="num">{{ money(row.amount) }}</ion-col>
              <ion-col size="4" size-md="2" class="num">{{ money(row.bookValueEnd) }}</ion-col>
              <ion-col size="12" size-md="2"><ion-note>{{ row.booked !== undefined ? store.i18n.run_status_booked() : store.i18n.run_open() }}</ion-note></ion-col>
            </ion-row>
          }
          <ion-row class="total">
            <ion-col size="8" size-md="8">{{ store.i18n.run_total() }}</ion-col>
            <ion-col size="4" size-md="2" class="num">{{ money(store.planTotal()) }}</ion-col>
          </ion-row>
        </ion-grid>

        <div class="actions">
          @if (store.bookedKey()) {
            <ion-note>{{ store.i18n.run_bookedInfo() }}</ion-note>
            <ion-button fill="outline" (click)="showBooking()">{{ store.i18n.run_showBooking() }}</ion-button>
          } @else if (store.canPost()) {
            <ion-button [disabled]="store.posting()" (click)="store.postDepreciation()">
              @if (store.posting()) { <ion-spinner name="dots" /> } @else { {{ postLabel() }} }
            </ion-button>
          }
        </div>
      }
    </ion-content>
  `,
})
export class DepreciationRunPage {
  protected readonly store = inject(AssetStore);
  private readonly router = inject(Router);

  protected readonly postLabel = computed(() => this.store.i18n.run_post().replace('{year}', this.store.fiscalRange().label));

  protected money(minor: number): string {
    return chf(minor);
  }

  /** the run's booking in the journal, in its year */
  protected async showBooking(): Promise<void> {
    const year = Number(this.store.fiscalRange().to.substring(0, 4));
    await this.router.navigate(['/accounting', this.store.accountingTenantId(), 'journal', 'c-journal'],
      { queryParams: { year, bookingKey: this.store.bookedKey() } });
  }
}

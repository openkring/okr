import { Component, computed, inject } from '@angular/core';
import {
  IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonLabel, IonMenuButton, IonRow,
  IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { CommissionEntryModel, MeteringRecordModel } from '@okr/shared-models';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { hasRole } from '@okr/shared-util-core';

import { MeteringStore, MeteringView } from './metering.store';

/**
 * The metering ledger (C3 §6/§7), bkaiser-side in tenant `kring`.
 *
 * Two lists of the same period side by side, because the audit question is always the same one:
 * *does what was billed follow from what was reported?* Records are what a partner's installation
 * pushed; entries are what `runCommission` derived from them. Nothing on this screen is editable —
 * both sides are written server-side, and a ledger a human can retype is not evidence.
 */
@Component({
  selector: 'okr-metering-list',
  standalone: true,
  imports: [
    Spinner, EmptyList,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton, IonButton,
    IonContent, IonGrid, IonRow, IonCol, IonLabel,
    IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
  ],
  providers: [MeteringStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ rowCount() }} {{ isRecords() ? store.i18n.records() : store.i18n.entries() }}</ion-title>
        @if(isAdmin()) {
          <ion-buttons slot="end">
            <ion-button [disabled]="store.isRunning()" (click)="store.run()">{{ store.i18n.run_label() }}</ion-button>
          </ion-buttons>
        }
      </ion-toolbar>

      <ion-toolbar color="light">
        <ion-segment [value]="store.view()" (ionChange)="onViewChange($event)">
          <ion-segment-button value="records"><ion-label>{{ store.i18n.records() }}</ion-label></ion-segment-button>
          <ion-segment-button value="entries"><ion-label>{{ store.i18n.entries() }}</ion-label></ion-segment-button>
        </ion-segment>
        <ion-buttons slot="end">
          <ion-select [label]="store.i18n.period_label()" [value]="store.period()" interface="popover" (ionChange)="onPeriodChange($event)">
            @for(period of store.periods(); track period) {
              <ion-select-option [value]="period">{{ period }}</ion-select-option>
            }
          </ion-select>
        </ion-buttons>
      </ion-toolbar>

      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          @if(isRecords()) {
            <ion-row>
              <ion-col size="4"><ion-label><strong>{{ store.i18n.rec_header_customer() }}</strong></ion-label></ion-col>
              <ion-col size="3"><ion-label><strong>{{ store.i18n.rec_header_partner() }}</strong></ion-label></ion-col>
              <ion-col size="2"><ion-label><strong>{{ store.i18n.rec_header_users() }}</strong></ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.rec_header_addOns() }}</strong></ion-label></ion-col>
              <ion-col size="1" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.rec_header_received() }}</strong></ion-label></ion-col>
            </ion-row>
          } @else {
            <ion-row>
              <ion-col size="4"><ion-label><strong>{{ store.i18n.ent_header_customer() }}</strong></ion-label></ion-col>
              <ion-col size="3"><ion-label><strong>{{ store.i18n.rec_header_partner() }}</strong></ion-label></ion-col>
              <ion-col size="2"><ion-label><strong>{{ store.i18n.ent_header_band() }}</strong></ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.ent_header_subtotal() }}</strong></ion-label></ion-col>
              <ion-col size="1"><ion-label><strong>{{ store.i18n.ent_header_commission() }}</strong></ion-label></ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if(store.isLoading()) {
        <okr-spinner />
      } @else if(rowCount() === 0) {
        <okr-empty-list [message]="isRecords() ? store.i18n.empty_records() : store.i18n.empty_entries()" />
      } @else if(isRecords()) {
        <ion-grid>
          @for(record of store.records(); track record.okey) {
            <ion-row>
              <ion-col size="4"><ion-label>{{ record.customerName }}<br /><small>{{ record.tenantId }}</small></ion-label></ion-col>
              <ion-col size="3"><ion-label>{{ store.partnerName(record.partnerKey) }}</ion-label></ion-col>
              <ion-col size="2"><ion-label>{{ users(record) }}</ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label>{{ record.addOns.join(', ') }}</ion-label></ion-col>
              <ion-col size="1" class="ion-hide-md-down"><ion-label>{{ received(record) }}</ion-label></ion-col>
            </ion-row>
          }
        </ion-grid>
      } @else {
        <ion-grid>
          @for(entry of store.entries(); track entry.okey) {
            <ion-row>
              <ion-col size="4"><ion-label>{{ customerName(entry) }}<br /><small>{{ entry.tenantId }}</small></ion-label></ion-col>
              <ion-col size="3"><ion-label>{{ store.partnerName(entry.partnerKey) }}</ion-label></ion-col>
              <ion-col size="2"><ion-label>{{ entry.band }} ({{ entry.weightedUsers }})</ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label>{{ entry.subtotal.toFixed(2) }}</ion-label></ion-col>
              <ion-col size="1"><ion-label>{{ entry.commission.toFixed(2) }}</ion-label></ion-col>
            </ion-row>
          }
          <ion-row>
            <ion-col size="9"><ion-label><strong>{{ store.i18n.total_commission() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"></ion-col>
            <ion-col size="1"><ion-label><strong>{{ store.totalCommission().toFixed(2) }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      }
    </ion-content>
  `,
})
export class MeteringList {
  protected readonly store = inject(MeteringStore);

  protected readonly isRecords = computed(() => this.store.view() === 'records');
  protected readonly rowCount = computed(() =>
    this.isRecords() ? this.store.records().length : this.store.entries().length);
  protected readonly isAdmin = computed(() => hasRole('admin', this.store.currentUser()));

  protected onViewChange($event: CustomEvent): void {
    this.store.setView($event.detail.value as MeteringView);
  }

  protected onPeriodChange($event: CustomEvent): void {
    this.store.setPeriod($event.detail.value as string);
  }

  /** `12 (3)` — total users, privileged in brackets; the two numbers the band is weighted from. */
  protected users(record: MeteringRecordModel): string {
    return `${record.totalUsers} (${record.privilegedUsers})`;
  }

  protected received(record: MeteringRecordModel): string {
    const stamp = record.receivedAt ?? '';
    return stamp.length >= 8 ? `${stamp.slice(6, 8)}.${stamp.slice(4, 6)}.` : '';
  }

  /**
   * A commission entry carries no customer name — it is a ledger line, keyed by tenant. The name
   * is looked up in the record it was computed from, and falls back to the tenant id when the
   * record is gone (an entry outlives its record on purpose: the ledger has to stay readable).
   */
  protected customerName(entry: CommissionEntryModel): string {
    return this.store.records().find(r => r.tenantId === entry.tenantId)?.customerName ?? entry.tenantId;
  }
}

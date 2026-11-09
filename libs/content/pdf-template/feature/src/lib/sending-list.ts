import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonLabel, IonMenuButton, IonRow, IonSegment, IonSegmentButton,
  IonSelect, IonSelectOption, IonTitle, IonToolbar,
} from '@ionic/angular';

import { EmptyList, Spinner } from '@okr/shared-ui';
import { SENDING_PERIODS, SENDING_STATUSES, lastSendingAt, mailingKeyOfSource, sendingDateLabel, sendingStatusColor, sendingStatusLabelKey, sendingStatusOf } from '@okr/content-pdf-template-util';
import type { SendingPeriod, SendingStatus } from '@okr/content-pdf-template-util';
import type { SendingModel } from '@okr/shared-models';

import { SendingStore } from './sending.store';

/**
 * Every letter the tenant sent through the post provider, newest first, live (spec 1.150 §9).
 * A row opens its Versand. Route: `/mailings/letters` behind `isMemberAdminGuard` (the read rule of
 * `sendings`). The tenant's price is not shown here, only on the Versand page.
 */
@Component({
  selector: 'okr-sending-list',
  standalone: true,
  providers: [SendingStore],
  imports: [
    Spinner, EmptyList,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonContent, IonLabel, IonGrid, IonRow, IonCol, IonBadge,
    IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
  ],
  styles: [`
    ion-row { border-bottom: 1px solid var(--ion-color-light); }
    ion-row.link { cursor: pointer; }
    .m-meta { font-size: 0.8rem; color: var(--ion-color-medium); margin: 0; }
    ion-badge { font-weight: normal; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [scrollable]="true" [value]="store.status()" (ionChange)="onStatus($event.detail.value)">
          <ion-segment-button value="all"><ion-label>{{ store.i18n.status_all() }}</ion-label></ion-segment-button>
          @for (s of statuses; track s) {
            <ion-segment-button [value]="s"><ion-label>{{ statusLabel(s) }}</ion-label></ion-segment-button>
          }
        </ion-segment>
        <ion-select slot="end" interface="popover" [label]="store.i18n.period()" [value]="store.period()" (ionChange)="onPeriod($event.detail.value)">
          @for (p of periods; track p) {
            <ion-select-option [value]="p">{{ periodLabel(p) }}</ion-select-option>
          }
        </ion-select>
      </ion-toolbar>
      <ion-toolbar color="primary" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="5"><ion-label><strong>{{ store.i18n.recipient() }}</strong></ion-label></ion-col>
            <ion-col size="2"><ion-label><strong>{{ store.i18n.pages() }}</strong></ion-label></ion-col>
            <ion-col size="3"><ion-label><strong>{{ store.i18n.status() }}</strong></ion-label></ion-col>
            <ion-col size="2"><ion-label><strong>{{ store.i18n.date() }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (store.isLoading() && count() === 0) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for (s of store.filteredSendings(); track s.okey) {
            <ion-row [class.link]="!!versandOf(s)" (click)="open(s)">
              <ion-col size="12" size-md="5" class="ion-align-self-center">
                <ion-label>{{ recipientName(s) }}</ion-label>
              </ion-col>
              <ion-col size="3" size-md="2" class="ion-align-self-center">
                <ion-label><p class="m-meta ion-hide-md-up">{{ store.i18n.pages() }}</p>{{ s.pages }}</ion-label>
              </ion-col>
              <ion-col size="5" size-md="3" class="ion-align-self-center">
                <ion-badge [color]="color(s)">{{ label(s) }}</ion-badge>
              </ion-col>
              <ion-col size="4" size-md="2" class="ion-align-self-center">
                <ion-label>{{ date(s) }}</ion-label>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `,
})
export class SendingList {
  protected readonly store = inject(SendingStore);
  private readonly router = inject(Router);

  protected readonly statuses = SENDING_STATUSES;
  protected readonly periods = SENDING_PERIODS;
  protected readonly count = computed(() => this.store.sendings().length);
  protected readonly filteredCount = computed(() => this.store.filteredSendings().length);

  protected statusLabel(status: SendingStatus): string {
    return this.store.i18n[sendingStatusLabelKey(status)]();
  }

  protected periodLabel(period: SendingPeriod): string {
    const i18n = this.store.i18n;
    switch (period) {
      case 'days30': return i18n.period_days30();
      case 'days90': return i18n.period_days90();
      case 'year': return i18n.period_year();
      default: return i18n.period_all();
    }
  }

  protected label(s: SendingModel): string {
    return this.statusLabel(sendingStatusOf(s.state));
  }

  protected color(s: SendingModel): string {
    return sendingStatusColor(sendingStatusOf(s.state));
  }

  /** A tombstone (failed before a recipient was known) has no name. */
  protected recipientName(s: SendingModel): string {
    return s.recipientName || this.store.i18n.unknown_recipient();
  }

  protected date(s: SendingModel): string {
    return sendingDateLabel(lastSendingAt(s));
  }

  protected versandOf(s: SendingModel): string {
    return mailingKeyOfSource(s.source);
  }

  protected onStatus(value: unknown): void {
    this.store.setStatus(String(value) as SendingStatus | 'all');
  }

  protected onPeriod(value: unknown): void {
    this.store.setPeriod(String(value) as SendingPeriod);
  }

  protected async open(s: SendingModel): Promise<void> {
    const key = this.versandOf(s);
    if (key) await this.router.navigate(['/mailings', 'view', key]);
  }
}

import { Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { IonButton, IonContent, IonHeader, IonInput, IonItem, IonLabel,
  IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BookingLineModel, BookingModel } from '@bk2/shared-models';
import { AppStore } from '@bk2/shared-feature';
import { AccountingStore } from '@bk2/finance-accounting-feature';
import { BookingService } from '@bk2/finance-booking-data-access';
import { AssetService, AssetMovementService } from '@bk2/finance-asset-data-access';
import { linearDepreciationMonthly, proRataMonths } from '@bk2/finance-asset-util';

@Component({
  selector: 'bk-depreciation-run-page',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonInput],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Abschreibungslauf</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Period End Date (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="periodEnd" />
      </ion-item>
      <ion-button expand="block" (click)="preview()">Vorschau</ion-button>
      @if (previewLines().length > 0) {
        <ion-list>
          @for (line of previewLines(); track line.accountKey) {
            <ion-item>
              <ion-label>{{ line.accountKey }}</ion-label>
              <ion-note slot="end">{{ line.debitAmount?.amount }}</ion-note>
            </ion-item>
          }
        </ion-list>
        <ion-button expand="block" color="primary" (click)="post()">Buchen</ion-button>
      }
    </ion-content>
  `,
})
export class DepreciationRunPage {
  private readonly accountingStore = inject(AccountingStore);
  private readonly appStore = inject(AppStore);
  private readonly assetService = inject(AssetService);
  protected readonly assetMovementService = inject(AssetMovementService);
  private readonly bookingService = inject(BookingService);

  protected periodEnd = '';
  protected readonly previewLines = signal<BookingLineModel[]>([]);
  private pendingBooking: { booking: BookingModel; lines: BookingLineModel[] } | null = null;

  protected readonly assetsResource = rxResource({
    stream: () => this.assetService.list(this.accountingStore.accountingTenantId()),
  });

  protected async preview(): Promise<void> {
    const accountingTenantId = this.accountingStore.accountingTenantId();
    const assets = await firstValueFrom(this.assetService.list(accountingTenantId));
    const lines: BookingLineModel[] = [];
    const tenantId = this.appStore.tenantId();

    for (const asset of assets) {
      const months = proRataMonths(asset.commissioningDate ?? asset.acquisitionDate, this.periodEnd);
      if (months <= 0) continue;
      const acquisitionCents = asset.acquisitionValue?.amount ?? 0;
      const monthly = linearDepreciationMonthly(acquisitionCents, asset.usefulLifeMonths ?? 1);
      const periodDepreciation = monthly * months;
      if (periodDepreciation <= 0) continue;

      const drLine = new BookingLineModel(tenantId, accountingTenantId);
      drLine.accountKey = asset.expenseAccountKey;
      drLine.debitAmount = { amount: periodDepreciation, currency: 'CHF', periodicity: 'one-time' };
      lines.push(drLine);

      const crLine = new BookingLineModel(tenantId, accountingTenantId);
      crLine.accountKey = asset.balanceAccountKey;
      crLine.creditAmount = { amount: periodDepreciation, currency: 'CHF', periodicity: 'one-time' };
      lines.push(crLine);
    }

    this.previewLines.set(lines);

    const year = parseInt(this.periodEnd.substring(0, 4), 10);
    const seq = await this.bookingService.nextSequence(year, accountingTenantId);
    const booking = new BookingModel(tenantId, accountingTenantId);
    booking.bookingNo = seq;
    booking.date = this.periodEnd;
    booking.title = `Abschreibung ${this.periodEnd}`;
    booking.status = 'draft';
    this.pendingBooking = { booking, lines };
  }

  protected async post(): Promise<void> {
    if (!this.pendingBooking) return;
    const user = this.appStore.currentUser();
    await this.bookingService.create(this.pendingBooking.booking, this.pendingBooking.lines, user ?? undefined);
    this.previewLines.set([]);
    this.pendingBooking = null;
  }
}

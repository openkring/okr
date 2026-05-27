import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { BookingLineModel, BookingModel, UserModel, VatCodeModel } from '@bk2/shared-models';
import { validateBookingBalance } from '@bk2/finance-booking-util';
import { VatCodeService } from '@bk2/finance-vat-code-data-access';

@Component({
  selector: 'bk-booking-edit-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View' : (editBooking.bkey ? 'Edit' : 'New') }} Booking</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) {
            <ion-button (click)="save()" [disabled]="!isBalanced">Save</ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Date (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="editBooking.date" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Description</ion-label>
        <ion-input [(ngModel)]="editBooking.title" [readonly]="readOnly()" />
      </ion-item>

      @for (line of editLines; track $index) {
        <ion-item>
          <ion-label position="stacked">Account</ion-label>
          <ion-input [(ngModel)]="line.accountKey" [readonly]="readOnly()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Debit (cents)</ion-label>
          <ion-input type="number" [(ngModel)]="line.debitAmount!.amount" [readonly]="readOnly()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Credit (cents)</ion-label>
          <ion-input type="number" [(ngModel)]="line.creditAmount!.amount" [readonly]="readOnly()" />
        </ion-item>
        @if (vatCodes.length > 0) {
          <ion-item>
            <ion-label position="stacked">VAT Code</ion-label>
            <ion-select [(ngModel)]="line.vatCodeKey" [disabled]="readOnly()">
              <ion-select-option value="">— none —</ion-select-option>
              @for (vc of vatCodes; track vc.bkey) {
                <ion-select-option [value]="vc.bkey">{{ vc.code }} {{ vc.rate }}%</ion-select-option>
              }
            </ion-select>
          </ion-item>
        }
        <ion-item>
          <ion-label position="stacked">FX Amount (foreign currency cents, 0 = none)</ion-label>
          <ion-input type="number" [(ngModel)]="line.amountFx!.amount" [readonly]="readOnly()" />
        </ion-item>
      }

      @if (!isBalanced) {
        <p style="color:red">Debit and credit totals must be equal.</p>
      }

      @if (!readOnly()) {
        <ion-button expand="block" (click)="addLine()">+ Add Line</ion-button>
      }
    </ion-content>
  `,
})
export class BookingEditModal implements OnInit {
  public readonly booking = input.required<BookingModel>();
  public readonly lines = input.required<BookingLineModel[]>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);
  private readonly vatCodeService = inject(VatCodeService);

  protected editBooking!: BookingModel;
  protected editLines!: BookingLineModel[];
  protected vatCodes: VatCodeModel[] = [];

  public async ngOnInit(): Promise<void> {
    this.editBooking = { ...this.booking() };
    this.editLines = this.lines().map(l => ({
      ...l,
      debitAmount:  l.debitAmount  ?? { amount: 0, currency: 'CHF' as const, periodicity: 'one-time' as const },
      creditAmount: l.creditAmount ?? { amount: 0, currency: 'CHF' as const, periodicity: 'one-time' as const },
      amountFx:     l.amountFx    ?? { amount: 0, currency: 'EUR' as const, periodicity: 'one-time' as const },
    }));
    if (this.editBooking.accountingTenantId) {
      this.vatCodes = await firstValueFrom(
        this.vatCodeService.list(this.editBooking.accountingTenantId)
      );
    }
  }

  protected get isBalanced(): boolean {
    return validateBookingBalance(this.editLines);
  }

  protected addLine(): void {
    const blank = new BookingLineModel(
      this.editBooking.tenants[0] ?? '',
      this.editBooking.accountingTenantId
    );
    blank.bookingKey = this.editBooking.bkey;
    blank.debitAmount  = { amount: 0, currency: 'CHF', periodicity: 'one-time' };
    blank.creditAmount = { amount: 0, currency: 'CHF', periodicity: 'one-time' };
    blank.amountFx     = { amount: 0, currency: 'EUR', periodicity: 'one-time' };
    this.editLines = [...this.editLines, blank];
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (!this.isBalanced) return;
    const cleanLines = this.editLines.map(l => ({
      ...l,
      debitAmount:  (l.debitAmount?.amount  ?? 0) > 0 ? l.debitAmount  : undefined,
      creditAmount: (l.creditAmount?.amount ?? 0) > 0 ? l.creditAmount : undefined,
      amountFx:     (l.amountFx?.amount     ?? 0) > 0 ? l.amountFx     : undefined,
    }));
    await this.modalController.dismiss({ booking: this.editBooking, lines: cleanLines }, 'confirm');
  }
}

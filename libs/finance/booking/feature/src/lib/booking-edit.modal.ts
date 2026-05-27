import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonHeader, IonInput,
  IonItem, IonLabel, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { BookingLineModel, BookingModel, UserModel } from '@bk2/shared-models';
import { validateBookingBalance } from '@bk2/finance-booking-util';

@Component({
  selector: 'bk-booking-edit-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput,
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
        <ion-label position="stacked">Date</ion-label>
        <ion-input [(ngModel)]="editBooking.date" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Description</ion-label>
        <ion-input [(ngModel)]="editBooking.title" [readonly]="readOnly()" />
      </ion-item>
      @for (line of editLines; track $index) {
        <ion-item>
          <ion-label>Account: {{ line.accountKey }} | Dr: {{ line.debitAmount?.amount }} | Cr: {{ line.creditAmount?.amount }}</ion-label>
        </ion-item>
      }
      @if (!isBalanced) {
        <p>Debit and credit totals must be equal.</p>
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

  protected editBooking!: BookingModel;
  protected editLines!: BookingLineModel[];

  public ngOnInit(): void {
    this.editBooking = { ...this.booking() };
    this.editLines = [...this.lines()];
  }

  protected get isBalanced(): boolean {
    return validateBookingBalance(this.editLines);
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (!this.isBalanced) return;
    await this.modalController.dismiss({ booking: this.editBooking, lines: this.editLines }, 'confirm');
  }
}

import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { PaymentOrderModel, UserModel } from '@bk2/shared-models';

@Component({
  selector: 'bk-payment-order-edit-modal',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View Payment Order' : (order().bkey ? 'Edit' : 'New Payment Order') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) { <ion-button (click)="save()" [disabled]="!isValid">Save</ion-button> }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Debit Account Key</ion-label>
        <ion-input [(ngModel)]="edit.debitAccountKey" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Execution Date (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="edit.executionDate" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Delivery Method</ion-label>
        <ion-select [(ngModel)]="edit.deliveryMethod" [disabled]="readOnly()">
          <ion-select-option value="pain001_download">pain.001 Download</ion-select-option>
          <ion-select-option value="bexio_api">Bexio API</ion-select-option>
          <ion-select-option value="ebics">EBICS</ion-select-option>
        </ion-select>
      </ion-item>
    </ion-content>
  `,
})
export class PaymentOrderEditModal implements OnInit {
  public readonly order = input.required<PaymentOrderModel>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);
  protected edit!: PaymentOrderModel;

  public ngOnInit(): void { this.edit = { ...this.order() }; }

  protected get isValid(): boolean {
    return !!this.edit.debitAccountKey && !!this.edit.executionDate;
  }

  protected async dismiss(): Promise<void> { await this.modalController.dismiss(null, 'cancel'); }
  protected async save(): Promise<void> { await this.modalController.dismiss(this.edit, 'confirm'); }
}

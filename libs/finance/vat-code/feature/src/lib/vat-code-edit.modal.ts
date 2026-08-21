import { Component, computed, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AccountModel, VatCodeModel, UserModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { VAT_CODE_I18N_KEYS, VatCodeI18n } from '@okr/finance-vat-code-util';
import { dismissOverlay } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-vat-code-edit-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
    AccountSelect,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View VAT Code' : (vatCode().okey ? 'Edit VAT Code' : 'New VAT Code') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) {
            <ion-button (click)="save()">Save</ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Code</ion-label>
        <ion-input [(ngModel)]="edit.code" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Name</ion-label>
        <ion-input [(ngModel)]="edit.name" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Rate (%)</ion-label>
        <ion-input type="number" [(ngModel)]="edit.rate" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Direction</ion-label>
        <ion-select [(ngModel)]="edit.direction" [disabled]="readOnly()">
          <ion-select-option value="input">Input (Vorsteuer)</ion-select-option>
          <ion-select-option value="output">Output (Umsatzsteuer)</ion-select-option>
        </ion-select>
      </ion-item>
      <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()"
        [selectedKey]="edit.accountKey" (selectedKeyChange)="edit.accountKey = $event"
        [readOnly]="readOnly()" />
      <ion-item>
        <ion-label position="stacked">Valid From (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="edit.validFrom" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Valid To (YYYYMMDD, leave blank for open-ended)</ion-label>
        <ion-input [(ngModel)]="edit.validTo" [readonly]="readOnly()" />
      </ion-item>
    </ion-content>
  `,
})
export class VatCodeEditModal implements OnInit {
  public readonly vatCode = input.required<VatCodeModel>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);
  public readonly accounts = input<AccountModel[]>([]);

  private readonly modalController = inject(ModalController);
  // Direct inject (no store): the store opens this modal, importing it back would be circular.
  private readonly i18n = inject(I18nService).translateAll(VAT_CODE_I18N_KEYS) as VatCodeI18n;
  protected accountI18n = computed(() => ({
    name: 'accountKey', label: this.i18n.account_label(), helper: this.i18n.account_helper()
  } as AccountSelectI18n));
  protected edit!: VatCodeModel;

  ngOnInit(): void {
    this.edit = { ...this.vatCode() };
  }

  protected async dismiss(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  protected async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.edit, 'confirm');
  }
}

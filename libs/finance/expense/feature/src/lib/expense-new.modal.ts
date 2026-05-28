import { Component, inject, model, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  ModalController, ToastController,
  IonButton, IonButtons, IonContent, IonFooter,
  IonHeader, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';

import { UploadService } from '@bk2/avatar-data-access';
import { AddressService } from '@bk2/subject-address-data-access';

import { ExpenseFormValue } from '@bk2/finance-expense-util';
import { ExpenseForm, ExpenseFormI18n } from '@bk2/finance-expense-ui';
import { ExpenseStore } from './expense.store';
import { PFX } from './scope';

const EXPENSE_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];

@Component({
  selector: 'bk-expense-new-modal',
  standalone: true,
  imports: [
    ExpenseForm,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonFooter,
  ],
  providers: [ExpenseStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <bk-expense-form
        [i18n]="formI18n"
        [ibans]="ibans()"
        [(formData)]="formValue"
        [(files)]="files"
        (pickFiles)="onPickFiles()"
        (takePhoto)="onTakePhoto()"
        (validChange)="isValid = $event"
      />
    </ion-content>
    <ion-footer>
      @if (store.submitStep() !== 'idle') {
        <p style="text-align:center; padding: 8px;">{{ store.submitLabel() }}</p>
      }
      <ion-button expand="block"
        [disabled]="!isValid || files().length === 0 || !store.canSubmit()"
        (click)="onSubmit()">
        {{ i18n.submit() }}
      </ion-button>
    </ion-footer>
  `,
})
export class ExpenseNewModal {
  protected readonly store = inject(ExpenseStore);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly uploadService = inject(UploadService);
  private readonly addressService = inject(AddressService);
  private readonly appStore = inject(AppStore);
  private readonly i18nService = inject(I18nService);

  protected readonly i18n = this.i18nService.translateAll({
    title:          PFX + 'new.title',
    cancel:         PFX + 'new.cancel',
    submit:         PFX + 'new.submit',
    abstract_label: PFX + 'field.abstract',
    amount_label:   PFX + 'field.amount',
    currency_label: PFX + 'field.currency',
    iban_label:     PFX + 'field.iban',
    iban_new:       PFX + 'field.iban.new',
    category_label: PFX + 'field.category',
    costcenter_label: PFX + 'field.costcenter',
    note_label:     PFX + 'field.note',
    belege_label:   PFX + 'field.belege',
    belege_pick:    PFX + 'field.belege.pick',
    belege_photo:   PFX + 'field.belege.photo',
    toast_success:  PFX + 'submit.done',
    toast_error:    PFX + 'submit.error',
  });

  protected formValue = model<ExpenseFormValue>({
    abstract: '', amountCHF: 0, currency: 'CHF', iban: '', category: '', costCenterId: '', note: '',
  });
  protected files = model<File[]>([]);
  protected isValid = false;

  private readonly ibansResource = rxResource({
    stream: () => {
      const user = this.appStore.currentUser();
      return this.addressService.listBankAccounts(user?.bkey ?? '');
    },
  });

  protected ibans() {
    return this.ibansResource.value() ?? [];
  }

  protected readonly formI18n: ExpenseFormI18n = {
    abstract_label:   this.i18n.abstract_label,
    amount_label:     this.i18n.amount_label,
    currency_label:   this.i18n.currency_label,
    iban_label:       this.i18n.iban_label,
    iban_new:         this.i18n.iban_new,
    category_label:   this.i18n.category_label,
    costcenter_label: this.i18n.costcenter_label,
    note_label:       this.i18n.note_label,
    belege_label:     this.i18n.belege_label,
    belege_pick:      this.i18n.belege_pick,
    belege_photo:     this.i18n.belege_photo,
  };

  protected async onPickFiles(): Promise<void> {
    const picked = await this.uploadService.pickMultipleFiles(EXPENSE_MIMETYPES);
    if (picked.length > 0) {
      this.files.update(fs => [...fs, ...picked].slice(0, 10));
    }
  }

  protected async onTakePhoto(): Promise<void> {
    const photo = await this.uploadService.takePhoto();
    if (photo.webPath) {
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      this.files.update(fs => [...fs, file].slice(0, 10));
    }
  }

  protected async onSubmit(): Promise<void> {
    this.store.resetSubmit();
    await this.store.submit(this.formValue(), this.files());

    if (this.store.submitStep() === 'done') {
      const toast = await this.toastController.create({
        message: this.i18n.toast_success(),
        duration: 3000,
        color: 'success',
      });
      await toast.present();
      await this.modalController.dismiss(null, 'confirm');
    } else if (this.store.submitStep() === 'error') {
      const toast = await this.toastController.create({
        message: this.i18n.toast_error(),
        duration: 4000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}

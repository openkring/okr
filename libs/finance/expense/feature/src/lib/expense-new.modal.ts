import { Component, computed, effect, inject, model, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  ModalController, ToastController,
  IonContent,
} from '@ionic/angular/standalone';

import { PersonModelName } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';

import { UploadService } from '@okr/avatar-data-access';
import { AddressService } from '@okr/subject-address-data-access';

import { ExpenseFormValue } from '@okr/finance-expense-util';
import { ExpenseForm, ExpenseFormI18n } from '@okr/finance-expense-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { ExpenseStore } from './expense.store';
import { PFX } from './scope';

const EXPENSE_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];

@Component({
  selector: 'okr-expense-new-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, ExpenseForm,
    IonContent,
  ],
  providers: [ExpenseStore],
  template: `
    <okr-header [i18n]="{ title: i18n.title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (cancelClicked)="dismiss()" (saveClicked)="onSubmit()" />
    }
    <ion-content>
      @if (store.submitStep() !== 'idle') {
        <p style="text-align:center; padding: 8px;">{{ store.submitLabel() }}</p>
      } @else if (files().length === 0) {
        <p style="text-align:center; padding: 8px; color: var(--ion-color-medium);">{{ i18n.receipt_hint() }}</p>
      }
      <okr-expense-form
        [i18n]="formI18n"
        [favoriteIban]="favoriteIban()"
        [(formData)]="formValue"
        [(files)]="files"
        (pickFiles)="onPickFiles()"
        (takePhoto)="onTakePhoto()"
        (dirty)="formDirty.set($event)"
        (valid)="isValid.set($event)"
      />
    </ion-content>
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
    save:           PFX + 'new.save',
    receipt_hint:   PFX + 'new.receiptHint',
    abstract_label: PFX + 'field.abstract',
    amount_label:   PFX + 'field.amount',
    currency_label: PFX + 'field.currency',
    transfer_label: PFX + 'field.transfer.label',
    transfer_me:    PFX + 'field.transfer.me',
    transfer_issuer: PFX + 'field.transfer.issuer',
    iban_label:     PFX + 'field.iban.label',
    iban_on:        PFX + 'field.iban.on',
    iban_profile_hint: PFX + 'field.iban.profileHint',
    iban_change:    PFX + 'field.iban.change',
    category_label: PFX + 'field.category',
    costcenter_label: PFX + 'field.costcenter',
    note_label:     PFX + 'field.note',
    belege_label:   PFX + 'field.belege.label',
    belege_pick:    PFX + 'field.belege.pick',
    belege_photo:   PFX + 'field.belege.photo',
    toast_success:  PFX + 'submit.done',
    toast_error:    PFX + 'submit.error',
  });

  protected formValue = model<ExpenseFormValue>({
    abstract: '', amountCHF: 0, currency: 'CHF', transferTo: 'me', iban: '', category: '', costCenterId: '', note: '',
  });
  protected files = model<File[]>([]);
  protected readonly isValid = signal(false);
  protected readonly formDirty = signal(false);

  private readonly ibansResource = rxResource({
    stream: () => {
      // Bank-account addresses are linked to the person via 'person.<key>' (modelType-prefixed).
      const parentKey = `${PersonModelName}.${this.appStore.currentUser()?.personKey ?? ''}`;
      return this.addressService.listBankAccounts(parentKey);
    },
  });

  /** The user's favorite bank-account IBAN, or '' if none is stored. */
  protected readonly favoriteIban = computed(() =>
    (this.ibansResource.value() ?? []).find(a => a.isFavorite)?.iban ?? ''
  );

  // The Vest suite already requires a valid IBAN when transferTo='me', so isValid() covers it.
  protected readonly showConfirmation = computed(() =>
    this.isValid() && this.formDirty() && this.files().length > 0 && this.store.canSubmit()
  );

  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  }));

  protected readonly formI18n: ExpenseFormI18n = {
    abstract_label:   this.i18n.abstract_label,
    amount_label:     this.i18n.amount_label,
    currency_label:   this.i18n.currency_label,
    transfer_label:   this.i18n.transfer_label,
    transfer_me:      this.i18n.transfer_me,
    transfer_issuer:  this.i18n.transfer_issuer,
    iban_label:       this.i18n.iban_label,
    iban_on:          this.i18n.iban_on,
    iban_profile_hint: this.i18n.iban_profile_hint,
    iban_change:      this.i18n.iban_change,
    category_label:   this.i18n.category_label,
    costcenter_label: this.i18n.costcenter_label,
    note_label:       this.i18n.note_label,
    belege_label:     this.i18n.belege_label,
    belege_pick:      this.i18n.belege_pick,
    belege_photo:     this.i18n.belege_photo,
  };

  private ibanPrefilled = false;

  constructor() {
    // Seed the form's IBAN with the user's favorite once it loads, so it is used for
    // validation/submission. Seed ONCE only — otherwise a resource re-emit would overwrite
    // an IBAN the user deliberately changed via "Andere IBAN verwenden".
    effect(() => {
      const fav = this.favoriteIban();
      if (fav && !this.ibanPrefilled) {
        this.ibanPrefilled = true;
        this.formValue.update(v => ({ ...v, iban: fav }));
      }
    });
  }

  protected async onPickFiles(): Promise<void> {
    const picked = await this.uploadService.pickMultipleFiles(EXPENSE_MIMETYPES);
    if (picked.length > 0) {
      this.formDirty.set(true);
      this.files.update(fs => [...fs, ...picked].slice(0, 10));
    }
  }

  protected async onTakePhoto(): Promise<void> {
    const photo = await this.uploadService.takePhoto();
    if (photo?.webPath) {
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      this.formDirty.set(true);
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
      await dismissOverlay(this.modalController, null, 'confirm');
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
    await dismissOverlay(this.modalController, null, 'cancel');
  }
}

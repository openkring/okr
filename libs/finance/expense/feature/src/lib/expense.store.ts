import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AddressModel, ExpenseModel, PersonModelName } from '@okr/shared-models';

import { AddressService } from '@okr/subject-address-data-access';
import { UploadService } from '@okr/avatar-data-access';

import { ExpenseService } from '@okr/finance-expense-data-access';
import { chfToCents, EXPENSE_I18N_KEYS, ExpenseFormValue, ExpenseI18n, newExpenseModel, normalizeIban } from '@okr/finance-expense-util';

export type SubmitStep = 'idle' | 'iban' | 'upload' | 'saving' | 'done' | 'error';

export type ExpenseListId = 'all' | 'my';

export type { ExpenseI18n };

export interface ExpenseState {
  submitStep: SubmitStep;
  submitError: string;
  listId: ExpenseListId;
}

export const ExpenseStore = signalStore(
  withState<ExpenseState>({ submitStep: 'idle', submitError: '', listId: 'my' }),
  withProps(() => ({
    env:                     inject(ENV),
    appStore:                inject(AppStore),
    modalController:         inject(ModalController),
    addressService:          inject(AddressService),
    uploadService:           inject(UploadService),
    expenseService:          inject(ExpenseService),
    i18nService:             inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(EXPENSE_I18N_KEYS),
    expensesResource: rxResource<ExpenseModel[], unknown>({
      stream: () => {
        const user = store.appStore.currentUser();
        if (!user) return store.expenseService.listForUser('');
        // 'all' shows every expense (treasurer view); 'my' only the current user's.
        return store.listId() === 'all'
          ? store.expenseService.listAll()
          : store.expenseService.listForUser(user.okey);
      },
    }),
  })),
  withComputed(store => ({
    expenses:    computed(() => store.expensesResource.value() ?? []),
    isLoading:   computed(() => store.expensesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId:    computed(() => store.env.tenantId),
    canSubmit:   computed(() => store.submitStep() === 'idle' || store.submitStep() === 'error'),
    submitLabel: computed(() => {
      const step = store.submitStep();
      const i = store.i18n;
      switch (step) {
        case 'iban':    return i.submit_iban();
        case 'upload':  return i.submit_upload();
        case 'saving':  return i.submit_saving();
        case 'done':    return i.submit_done();
        case 'error':   return i.submit_error();
        default:        return '';
      }
    }),
  })),
  withMethods(store => ({
    async openDetail(expense: ExpenseModel): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ExpenseDetailModal } = await import('./expense-detail.modal') as any;
      const modal = await store.modalController.create({
        component: ExpenseDetailModal,
        componentProps: { expense },
      });
      await modal.present();
    },

    setListId(listId: ExpenseListId): void {
      patchState(store, { listId });
    },

    resetSubmit(): void {
      patchState(store, { submitStep: 'idle', submitError: '' });
    },

    async submit(formValue: ExpenseFormValue, files: File[]): Promise<void> {
      if (files.length === 0) return;
      const currentUser = store.currentUser();
      if (!currentUser) return;

      const tenantId = store.tenantId();
      const userId = currentUser.okey;
      // Addresses are linked to the person via 'person.<key>' (modelType-prefixed), not the user.
      const addressParentKey = `${PersonModelName}.${currentUser.personKey}`;
      const accountingTenantId = tenantId;

      let newAddressKey: string | undefined;
      let expenseKey: string | undefined;

      // Step 1 — IBAN (only for transfers to the employee; 'issuer' transfers need no IBAN here)
      patchState(store, { submitStep: 'iban' });
      try {
        const normalizedIban = normalizeIban(formValue.iban ?? '');
        if (formValue.transferTo === 'me' && normalizedIban.length > 0) {
          const existingIbans = await firstValueFrom(store.addressService.listBankAccounts(addressParentKey));
          // Avoid duplicates: only create a bank-account address if the (normalized) IBAN is not
          // already stored on the person. Coalesce a.iban — legacy docs may miss the field.
          const alreadyExists = existingIbans.some(a => normalizeIban(a.iban ?? '') === normalizedIban);
          if (!alreadyExists) {
            // A newly entered IBAN is stored as a bank-account address on the user's person,
            // becoming the favorite only if the person has none yet.
            const addr = new AddressModel(tenantId);
            addr.addressChannel = 'bankaccount';
            addr.iban = normalizedIban;
            addr.parentKey = addressParentKey;
            addr.isFavorite = !existingIbans.some(a => a.isFavorite);
            newAddressKey = await store.addressService.create(addr, currentUser);
          }
        }
      } catch (e) {
        console.error('[expense-submit] IBAN step failed', e);
        patchState(store, { submitStep: 'error', submitError: 'IBAN step failed' });
        return;
      }

      // Step 2 — Persist the expense first, so its key can correlate the OCR upload.
      patchState(store, { submitStep: 'saving' });
      try {
        const expense = newExpenseModel(tenantId, userId, accountingTenantId);
        expense.abstract     = formValue.abstract;
        expense.amountTotal  = chfToCents(formValue.amountCHF);
        expense.currency     = formValue.currency;
        expense.transferTo   = formValue.transferTo;
        expense.iban         = formValue.transferTo === 'me' ? normalizeIban(formValue.iban) : '';
        expense.category     = formValue.category;
        expense.costCenterId = formValue.costCenterId;
        expense.note         = formValue.note;
        expense.status       = 'processing'; // pipeline will set 'validated' + bookingKey
        expenseKey = await store.expenseService.create(expense, currentUser);
        if (!expenseKey) throw new Error('ExpenseModel creation failed');
      } catch (e) {
        console.error('[expense-submit] Save step failed', e);
        if (newAddressKey) await compensateAddress(store.addressService, newAddressKey, currentUser);
        patchState(store, { submitStep: 'error', submitError: 'Save step failed' });
        return;
      }

      // Step 3 — Upload receipts to the OCR path; the pipeline extracts + books them.
      patchState(store, { submitStep: 'upload' });
      try {
        for (const file of files) {
          const storagePath = `tenant/${tenantId}/ocr/expense/${expenseKey}/${file.name}`;
          const downloadUrl = await store.uploadService.uploadFile(file, storagePath, file.name);
          if (!downloadUrl) throw new Error('Upload returned no URL for ' + file.name);
        }
      } catch (e) {
        console.error('[expense-submit] Upload step failed', e);
        if (newAddressKey) await compensateAddress(store.addressService, newAddressKey, currentUser);
        patchState(store, { submitStep: 'error', submitError: 'Upload step failed' });
        return;
      }

      patchState(store, { submitStep: 'done' });
      store.expensesResource.reload();
    },
  }))
);

async function compensateAddress(
  addressService: AddressService,
  addressKey: string,
  currentUser: Parameters<typeof addressService.delete>[1]
): Promise<void> {
  try {
    const addr = await firstValueFrom(addressService.read(addressKey));
    if (addr) await addressService.delete(addr, currentUser);
  } catch { /* best-effort */ }
}

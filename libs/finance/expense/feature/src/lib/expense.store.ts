import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { showToast } from '@okr/shared-util-angular';
import { AddressModel, ExpenseModel, PersonModelName } from '@okr/shared-models';

import { AddressService } from '@okr/subject-address-data-access';
import { UploadService } from '@okr/avatar-data-access';

import { ExpenseService } from '@okr/finance-expense-data-access';
import { chfToCents, EXPENSE_I18N_KEYS, ExpenseFormValue, ExpenseI18n, normalizeIban } from '@okr/finance-expense-util';

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
    alertController:         inject(AlertController),
    toastController:         inject(ToastController),
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

    async deleteExpense(expense: ExpenseModel): Promise<void> {
      const alert = await store.alertController.create({
        header: store.i18n.action_delete(),
        message: store.i18n.delete_confirm(),
        buttons: [
          { text: store.i18n.action_cancel(), role: 'cancel' },
          { text: store.i18n.action_delete(), role: 'destructive' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'destructive') return;
      try {
        await store.expenseService.deleteViaFunction(expense.okey);
        store.expensesResource.reload();
      } catch (e) {
        console.error('ExpenseStore.deleteExpense failed', e);
        await showToast(store.toastController, store.i18n.delete_error());
      }
    },

    async redoOcr(expense: ExpenseModel): Promise<void> {
      try {
        await store.expenseService.redoOcrViaFunction(expense.okey);
        store.expensesResource.reload();
        await showToast(store.toastController, store.i18n.redo_conf());
      } catch (e) {
        console.error('ExpenseStore.redoOcr failed', e);
        await showToast(store.toastController, store.i18n.redo_error());
      }
    },

    async openTask(expense: ExpenseModel): Promise<void> {
      if (!expense.taskKey) return;
      const task = await firstValueFrom(store.expenseService.readTask(expense.taskKey));
      if (!task) return;
      const { TaskEditModal } = await import('@okr/task-feature');
      const modal = await store.modalController.create({
        component: TaskEditModal,
        componentProps: {
          task,
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags('task'),
          states: store.appStore.getCategory('task_state'),
          priorities: store.appStore.getCategory('priority'),
          importances: store.appStore.getCategory('importance'),
          tenantId: store.env.tenantId,
          readOnly: true,
        },
      });
      await modal.present();
    },

    async openBooking(expense: ExpenseModel): Promise<void> {
      if (!expense.bookingKey) return;
      const [booking, lines] = await Promise.all([
        firstValueFrom(store.expenseService.readBooking(expense.bookingKey)),
        firstValueFrom(store.expenseService.listBookingLines(expense.bookingKey)),
      ]);
      if (!booking) return;
      const { BookingEditModal } = await import('@okr/finance-booking-feature');
      const modal = await store.modalController.create({
        component: BookingEditModal,
        componentProps: { booking, lines: lines ?? [], readOnly: true },
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
      // Addresses are linked to the person via 'person.<key>' (modelType-prefixed), not the user.
      const addressParentKey = `${PersonModelName}.${currentUser.personKey}`;

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

      // Step 2 — Persist the expense first, so its key can correlate the OCR upload. The
      // 'expenses' collection is CF-write-only: creation goes through the 'createExpense'
      // callable (it derives accountingTenantId server-side and owns the initial 'processing'
      // status) instead of a direct client SDK write.
      patchState(store, { submitStep: 'saving' });
      try {
        expenseKey = await store.expenseService.createViaFunction({
          tenantId,
          abstract:     formValue.abstract,
          amountTotal:  chfToCents(formValue.amountCHF),
          currency:     formValue.currency,
          transferTo:   formValue.transferTo,
          iban:         formValue.transferTo === 'me' ? normalizeIban(formValue.iban) : '',
          category:     formValue.category,
          costCenterId: formValue.costCenterId,
          note:         formValue.note,
          receiptCount: files.length,
        });
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
        // The 'expenses' collection is CF-write-only, so the client can no longer flip the
        // expense's status on failure (that would permission-deny). This leaves the
        // CF-created 'processing' expense in place — accepted limitation: it has no receipts,
        // so the pipeline never books it, and there is no client-side cleanup path.
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

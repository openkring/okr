import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AddressModel, BookingLineModel, BookingModel, ExpenseModel } from '@bk2/shared-models';
import { getTodayStr } from '@bk2/shared-util-core';
import { parseIban } from '@bk2/shared-util-angular';

import { AddressService } from '@bk2/subject-address-data-access';
import { UploadService } from '@bk2/avatar-data-access';
import { DocumentService } from '@bk2/document-data-access';
import { AccountingConfigService } from '@bk2/finance-accounting-data-access';
import { BookingService, BookingLineService } from '@bk2/finance-booking-data-access';

import { ExpenseDocumentService, ExpenseService } from '@bk2/finance-expense-data-access';
import { chfToCents, ExpenseFormValue, newExpenseDocumentModel, newExpenseModel, normalizeIban } from '@bk2/finance-expense-util';

import { PFX } from './scope';

export type SubmitStep = 'idle' | 'iban' | 'upload' | 'saving' | 'booking' | 'done' | 'error';

const EXPENSE_I18N_KEYS = {
  list_title:         PFX + 'list.title',
  new_title:          PFX + 'new.title',
  detail_title:       PFX + 'detail.title',
  submit_iban:        PFX + 'submit.iban',
  submit_upload:      PFX + 'submit.upload',
  submit_saving:      PFX + 'submit.saving',
  submit_booking:     PFX + 'submit.booking',
  submit_done:        PFX + 'submit.done',
  submit_error:       PFX + 'submit.error',
  status_draft:       PFX + 'status.draft',
  status_processing:  PFX + 'status.processing',
  status_validated:   PFX + 'status.validated',
  status_error:       PFX + 'status.error',
  status_posted:      PFX + 'status.posted',
} satisfies Record<string, string>;

export type ExpenseI18n = { [K in keyof typeof EXPENSE_I18N_KEYS]: Signal<string> };

export interface ExpenseState {
  submitStep: SubmitStep;
  submitError: string;
}

export const ExpenseStore = signalStore(
  withState<ExpenseState>({ submitStep: 'idle', submitError: '' }),
  withProps(() => ({
    env:                     inject(ENV),
    appStore:                inject(AppStore),
    modalController:         inject(ModalController),
    addressService:          inject(AddressService),
    uploadService:           inject(UploadService),
    documentService:         inject(DocumentService),
    accountingConfigService: inject(AccountingConfigService),
    bookingService:          inject(BookingService),
    _bookingLineService:     inject(BookingLineService),
    expenseService:          inject(ExpenseService),
    expenseDocService:       inject(ExpenseDocumentService),
    i18nService:             inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(EXPENSE_I18N_KEYS),
    expensesResource: rxResource({
      stream: () => {
        const user = store.appStore.currentUser();
        if (!user) return store.expenseService.listForUser('');
        const isTreasurer = user.roles?.privileged === true || user.roles?.admin === true;
        return isTreasurer
          ? store.expenseService.listAll()
          : store.expenseService.listForUser(user.bkey);
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
        case 'booking': return i.submit_booking();
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

    resetSubmit(): void {
      patchState(store, { submitStep: 'idle', submitError: '' });
    },

    async submit(formValue: ExpenseFormValue, files: File[]): Promise<void> {
      if (files.length === 0) return;
      const currentUser = store.currentUser();
      if (!currentUser) return;

      const tenantId = store.tenantId();
      const userId = currentUser.bkey;
      const accountingTenantId = tenantId;

      const accountingConfig = await firstValueFrom(
        store.accountingConfigService.read(accountingTenantId)
      );
      if (!accountingConfig) {
        patchState(store, { submitStep: 'error', submitError: 'No accounting config found' });
        return;
      }

      let newAddressKey: string | undefined;
      const documentKeys: string[] = [];
      let expenseKey: string | undefined;

      // Step 1 — IBAN
      patchState(store, { submitStep: 'iban' });
      try {
        const normalizedIban = normalizeIban(formValue.iban);
        const existingIbans = await firstValueFrom(store.addressService.listBankAccounts(userId));
        const normalizedExisting = existingIbans.map(a => parseIban(a.iban));
        const exists = normalizedExisting.includes(parseIban(normalizedIban));
        if (!exists) {
          const addr = new AddressModel(tenantId);
          addr.addressChannel = 'bankaccount';
          addr.iban = normalizedIban;
          addr.parentKey = userId;
          addr.isFavorite = existingIbans.length === 0;
          newAddressKey = await store.addressService.create(addr, currentUser);
        }
      } catch {
        patchState(store, { submitStep: 'error', submitError: 'IBAN step failed' });
        return;
      }

      // Step 2 — Upload documents
      patchState(store, { submitStep: 'upload' });
      try {
        for (const file of files) {
          const storagePath = `tenant/${tenantId}/expense/${file.name}`;
          const downloadUrl = await store.uploadService.uploadFile(file, storagePath, file.name);
          if (!downloadUrl) throw new Error('Upload returned no URL for ' + file.name);
          const docKey = await store.uploadService.createAndSaveDocument(
            file, tenantId, storagePath, downloadUrl, currentUser
          );
          if (!docKey) throw new Error('DocumentModel creation failed for ' + file.name);
          documentKeys.push(docKey);
        }
      } catch {
        await compensateDocuments(store.documentService, documentKeys, currentUser);
        if (newAddressKey) await compensateAddress(store.addressService, newAddressKey, currentUser);
        patchState(store, { submitStep: 'error', submitError: 'Upload step failed' });
        return;
      }

      // Step 3 — Persist expense + expense-document records
      patchState(store, { submitStep: 'saving' });
      try {
        const expense = newExpenseModel(tenantId, userId, accountingTenantId);
        expense.abstract     = formValue.abstract;
        expense.amountTotal  = chfToCents(formValue.amountCHF);
        expense.currency     = formValue.currency;
        expense.iban         = normalizeIban(formValue.iban);
        expense.category     = formValue.category;
        expense.costCenterId = formValue.costCenterId;
        expense.note         = formValue.note;
        expense.status       = 'draft';

        expenseKey = await store.expenseService.create(expense, currentUser);
        if (!expenseKey) throw new Error('ExpenseModel creation failed');

        for (const docKey of documentKeys) {
          const expDoc = newExpenseDocumentModel(tenantId, expenseKey, docKey);
          await store.expenseDocService.create(expDoc, currentUser);
        }
      } catch {
        await compensateDocuments(store.documentService, documentKeys, currentUser);
        if (newAddressKey) await compensateAddress(store.addressService, newAddressKey, currentUser);
        patchState(store, { submitStep: 'error', submitError: 'Save step failed' });
        return;
      }

      // Step 4 — Create booking
      patchState(store, { submitStep: 'booking' });
      try {
        const debitAccountKey  = formValue.category || accountingConfig.defaultExpenseAccountKey;
        const creditAccountKey = accountingConfig.employeePayablesAccountKey;
        const amountCents      = chfToCents(formValue.amountCHF);
        const userName = `${currentUser.firstName} ${currentUser.lastName}`.trim();

        const booking = new BookingModel(tenantId, accountingTenantId);
        booking.title = `${formValue.abstract} – Auslage ${userName}`;
        booking.date  = getTodayStr();

        const lineDebit = new BookingLineModel(tenantId, accountingTenantId);
        lineDebit.accountKey  = debitAccountKey;
        lineDebit.debitAmount = { amount: amountCents, currency: formValue.currency, periodicity: 'one-time' };
        lineDebit.bookingKey  = expenseKey!;

        const lineCredit = new BookingLineModel(tenantId, accountingTenantId);
        lineCredit.accountKey   = creditAccountKey;
        lineCredit.creditAmount = { amount: amountCents, currency: formValue.currency, periodicity: 'one-time' };
        lineCredit.bookingKey   = expenseKey!;

        const bookingKey = await store.bookingService.create(booking, [lineDebit, lineCredit], currentUser);
        if (!bookingKey) throw new Error('Booking creation failed');

        const savedExpense = await firstValueFrom(store.expenseService.read(expenseKey!));
        if (savedExpense) {
          savedExpense.bookingKey = bookingKey;
          savedExpense.status = 'posted';
          await store.expenseService.update(savedExpense, currentUser);
        }
      } catch {
        if (expenseKey) {
          try {
            const savedExpense = await firstValueFrom(store.expenseService.read(expenseKey));
            if (savedExpense) {
              savedExpense.status = 'error';
              await store.expenseService.update(savedExpense, currentUser);
            }
          } catch { /* best-effort */ }
        }
        patchState(store, { submitStep: 'error', submitError: 'Booking step failed' });
        return;
      }

      patchState(store, { submitStep: 'done' });
      store.expensesResource.reload();
    },
  }))
);

async function compensateDocuments(
  documentService: DocumentService,
  documentKeys: string[],
  currentUser: Parameters<typeof documentService.delete>[1]
): Promise<void> {
  for (const key of documentKeys) {
    try {
      const doc = await firstValueFrom(documentService.read(key));
      if (doc) await documentService.delete(doc, currentUser);
    } catch { /* best-effort */ }
  }
}

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

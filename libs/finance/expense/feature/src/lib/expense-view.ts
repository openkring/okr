import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular/standalone';
import { from, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountingConfigModel, AccountModel, CostCenterModel, ExpenseModel, OcrResultCollection, OcrResultModel, PersonModelName } from '@okr/shared-models';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, parseSwissQrBill } from '@okr/shared-util-core';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { CostCenterService } from '@okr/finance-cost-center-data-access';
import { ExpenseService } from '@okr/finance-expense-data-access';
import {
  buildSwissPaymentCode, centsToCHF, EXPENSE_I18N_KEYS, EXPENSE_STATE_CATEGORY_NAME, ExpenseI18n, ExpenseQrBill, ExpenseReceipt,
  renderSwissQrSvg, svgToDataUrl, SwissQrPayment, swissQrBlocker,
} from '@okr/finance-expense-util';
import { ExpenseEditFormI18n } from '@okr/finance-expense-ui';

/**
 * Everything the view modal and the edit modal render around the expense form — resolved ONCE,
 * here, so the two modals cannot drift apart. Call it in an injection context (a field
 * initializer). It deliberately does not use `ExpenseStore`: the store opens both modals, and a
 * mutual import leaves it undefined at module init (Ionic: "reading 'provide'").
 */
export function injectExpenseView(expense: Signal<ExpenseModel>) {
  const appStore = inject(AppStore);
  const env = inject(ENV);
  const expenseService = inject(ExpenseService);
  const accountService = inject(AccountService);
  const firestoreService = inject(FirestoreService);
  const actionSheetController = inject(ActionSheetController);
  const alertController = inject(AlertController);
  const toastController = inject(ToastController);
  const i18n = inject(I18nService).translateAll(EXPENSE_I18N_KEYS) as ExpenseI18n;
  const imgixBaseUrl = env.services.imgixBaseUrl;

  /** Legacy docs have no personKey (Firestore reads skip model defaults) — '' then. */
  const personKey = computed(() => expense().personKey ?? '');
  const person = computed(() => personKey() ? appStore.getPerson(personKey()) : undefined);
  const authorKey = computed(() => personKey() ? `${PersonModelName}.${personKey()}` : '');
  const authorName = computed(() => {
    const p = person();
    return p ? `${p.firstName} ${p.lastName}`.trim() : (expense().userName ?? '');
  });

  // Receipts live in Storage (tenant/{tenantId}/ocr/expense/{expenseKey}/), not in Firestore.
  const receiptsResource = rxResource<ExpenseReceipt[], string>({
    params: () => expense().okey,
    stream: ({ params }) => from(expenseService.listReceipts(params)),
  });
  const receipts = computed(() => receiptsResource.value() ?? []);

  /**
   * The OCR results of this expense's receipts (one per file, matched by storagePath). Read ONCE
   * for the QR-bill card and the "OCR-Text anzeigen" action. getDataOnce, not a stream: the
   * results only change when the OCR runs again, and a cache-first partial snapshot would hide a
   * QR-bill that is there.
   */
  const ocrResultsResource = rxResource<OcrResultModel[], string>({
    params: () => expense().okey,
    stream: ({ params }) => params ? from(firestoreService.getDataOnce<OcrResultModel>(OcrResultCollection, [
      { key: 'tenants', operator: 'array-contains', value: env.tenantId },
      { key: 'correlationKey', operator: '==', value: params },
    ], 'none')) : of([]),
  });
  const ocrResults = computed(() => ocrResultsResource.value() ?? []);

  /** The OCR result id of a receipt (matched by storagePath); '' when none. */
  const ocrResultKeyOf = (storagePath: string): string => ocrResults().find(r => r.storagePath === storagePath)?.okey ?? '';

  /** The QR-bills printed on the receipts, in receipt order, re-rendered from the stored payload. */
  const qrBills = computed((): ExpenseQrBill[] => receipts().flatMap(receipt => {
    const payload = ocrResults().find(r => r.storagePath === receipt.path)?.qrBill ?? '';
    const bill = parseSwissQrBill(payload);
    if (!bill) return [];
    return [{ receiptName: receipt.name, qrCode: svgToDataUrl(renderSwissQrSvg(payload)), bill }];
  }));

  const accountsResource = rxResource<AccountModel[], string>({
    params: () => expense().accountingTenantId ?? '',
    stream: ({ params }) => params ? accountService.list(params) : of([]),
  });
  const accounts = computed(() => accountsResource.value() ?? []);

  /** The DB-owned status category (labels, icons, colours); the item names are fixed. */
  const stateCategory = computed(() => appStore.getCategory(EXPENSE_STATE_CATEGORY_NAME));

  /**
   * The Swiss QR payment code for the reimbursement, or '' when a banking app would refuse it.
   * Only a transfer to the submitter has a known payee: name from the person, address from the
   * address directory (the registered-visible projection — never the raw vault). An issuer
   * transfer names nobody we know, so it shows the IBAN without a code.
   */
  const qrCode = computed(() => {
    const e = expense();
    if ((e.transferTo ?? 'me') !== 'me' || !e.iban) return '';
    const postal = (appStore.getDirectoryEntry(authorKey())?.entries ?? [])
      .filter(entry => entry.addressChannel === 'postal')
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))[0];
    const payment: SwissQrPayment = {
      iban: e.iban,
      creditor: {
        name: authorName(),
        street: postal?.streetName ?? '',
        buildingNumber: postal?.streetNumber ?? '',
        zip: postal?.zipCode ?? '',
        city: postal?.city ?? '',
        country: postal?.countryCode || 'CH',
      },
      amount: centsToCHF(e.amountTotal ?? 0),
      currency: e.currency ?? 'CHF',
      message: `${i18n.view_title()}: ${e.abstract ?? ''}`,
    };
    if (swissQrBlocker(payment)) return '';
    return svgToDataUrl(renderSwissQrSvg(buildSwissPaymentCode(payment)));
  });

  const formI18n: ExpenseEditFormI18n = {
    date_label:       i18n.date_label,
    author_label:     i18n.author_label,
    abstract_label:   i18n.abstract_label,
    amount_label:     i18n.amount_label,
    currency_label:   i18n.currency_label,
    transfer_label:   i18n.transfer_label,
    transfer_me:      i18n.transfer_me,
    transfer_issuer:  i18n.transfer_issuer,
    iban_label:       i18n.detail_iban,
    iban_copy_conf:   i18n.iban_copy_conf,
    qr_hint:          i18n.qr_hint,
    qrbill_title:     i18n.qrbill_title,
    qrbill_creditor:  i18n.qrbill_creditor,
    qrbill_reference: i18n.qrbill_reference,
    account_label:    i18n.account_label,
    cost_center_label: i18n.cost_center_label,
    note_label:       i18n.note_label,
    field_status:     i18n.field_status,
    receipts_label:   i18n.receipts_label,
    edit_locked_hint: i18n.edit_locked_hint,
    ocr_error:        i18n.detail_ocr_error,
  };

  /** Download · copy url · show the OCR result of one receipt. */
  async function showReceiptActions(receipt: ExpenseReceipt): Promise<void> {
    const options = createActionSheetOptions(receipt.name);
    options.buttons.push(createActionSheetButton('receipt.download', i18n.receipt_download(), imgixBaseUrl, 'download'));
    options.buttons.push(createActionSheetButton('receipt.copyUrl', i18n.receipt_copyUrl(), imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('receipt.ocr', i18n.receipt_ocr(), imgixBaseUrl, 'document'));
    options.buttons.push(createActionSheetButton('cancel', i18n.action_cancel(), imgixBaseUrl, 'cancel'));
    const sheet = await actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    switch (data?.action) {
      // The Storage download url is cross-origin, so an <a download> is ignored — open it instead.
      case 'receipt.download': window.open(receipt.url, '_blank', 'noopener'); break;
      case 'receipt.copyUrl':  await copyToClipboardWithConfirmation(toastController, receipt.url, i18n.receipt_copyUrl_conf()); break;
      case 'receipt.ocr':      await showOcrResult(receipt); break;
    }
  }

  /**
   * The OCR pipeline stores no raw text — Gemini extracts structured fields into `ocr-results`
   * (one doc per receipt file, keyed by its storagePath). Those fields ARE the OCR result.
   */
  async function showOcrResult(receipt: ExpenseReceipt): Promise<void> {
    const result = ocrResults().find(r => r.storagePath === receipt.path);
    const lines: string[] = [];
    if (!result) {
      lines.push(i18n.ocr_none());
    } else if (result.status === 'failed') {
      lines.push(`${i18n.ocr_failed()}: ${result.error ?? ''}`);
    } else {
      const vat = (result.vatLines ?? []).map(v => `${v.rate} %: ${centsToCHF(v.amount ?? 0).toFixed(2)}`).join(', ');
      lines.push(
        `${i18n.ocr_vendor()}: ${result.vendor ?? ''}`,
        `${i18n.ocr_date()}: ${convertDateFormatToString(result.invoiceDate ?? '', DateFormat.StoreDate, DateFormat.ViewDate, false)}`,
        `${i18n.amount_label()}: ${centsToCHF(result.grossAmount ?? 0).toFixed(2)} ${result.currency ?? ''}`,
        `${i18n.ocr_vat()}: ${vat || '—'}`,
        `${i18n.abstract_label()}: ${result.subject ?? ''}`,
      );
    }
    const alert = await alertController.create({
      header: i18n.receipt_ocr(),
      subHeader: receipt.name,
      message: lines.map(escapeHtml).join('<br>'),
      buttons: [i18n.close()],
    });
    await alert.present();
  }

  return {
    i18n, formI18n, imgixBaseUrl, authorKey, authorName, receipts, accounts, stateCategory, qrCode, qrBills, ocrResultKeyOf,
    reloadReceipts: () => { receiptsResource.reload(); ocrResultsResource.reload(); },
    showReceiptActions,
  };
}

/**
 * The Kostenstellen of the EXPENSE'S own book, for the treasurer's edit modal only. Not part of
 * `injectExpenseView`: the view modal and page are opened by members too, and `cost-centers` is
 * treasurer-only. Deliberately not the root `CostCenterStore`: that one follows the accounting
 * shell's book, which `/expense/...` is outside of — a cold load would show an empty picker, and a
 * gss expense opened after visiting the scs books would be offered scs Kostenstellen.
 * Enabled only when that book is kept natively (D9); unknown/loading config counts as native,
 * as in `AccountingStore.isExternallyManaged`.
 */
export function injectExpenseCostCenters(expense: Signal<ExpenseModel>) {
  const costCenterService = inject(CostCenterService);
  const configService = inject(AccountingConfigService);
  const accountingTenantId = computed(() => expense().accountingTenantId ?? '');

  const costCentersResource = rxResource<CostCenterModel[], string>({
    params: () => accountingTenantId(),
    stream: ({ params }) => params ? costCenterService.list(params) : of([]),
  });
  const configResource = rxResource<AccountingConfigModel | undefined, string>({
    params: () => accountingTenantId(),
    stream: ({ params }) => params ? configService.read(params) : of(undefined),
  });

  const costCenters = computed(() => costCentersResource.value() ?? []);
  const costCentersEnabled = computed(() =>
    !!accountingTenantId() && (configResource.value()?.accountingBackend ?? 'native') === 'native');
  return { costCenters, costCentersEnabled };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

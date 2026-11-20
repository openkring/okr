import { inject, Injectable } from '@angular/core';
import { combineLatest, Observable, of } from 'rxjs';
import { catchError, map, take } from 'rxjs/operators';

import {
  lastDayOfMonth, TRAINER_BILLING_I18N_KEYS, trainerAgreementPayload, trainerProfileCreatePayload, trainerProfileUpdateFields,
  workEntryCreatePayload, workEntryUpdateFields
} from '@okr/finance-trainer-billing-util';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import {
  AddressCollection, AddressModel, CalEventCollection, CalEventModel, TrainerAgreementCollection, TrainerAgreementModel, TrainerInvoiceCollection, TrainerInvoiceModel, TrainerProfileCollection,
  TrainerProfileModel, UserModel, WorkEntryCollection, WorkEntryModel
} from '@okr/shared-models';
import { die, getSystemQuery } from '@okr/shared-util-core';

/** The PDF a callable returns: base64 bytes and the file name the server chose. */
type PdfResult = { pdfBase64: string; filename: string };

/**
 * A PDF from a callable as a `File` (a `Blob` that also carries the server's file name), so the page can offer it for
 * download or show it without another round trip.
 */
export function pdfFileOf(result: PdfResult): File {
  const binary = atob(result.pdfBase64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], result.filename || 'trainer-invoice.pdf', { type: 'application/pdf' });
}

/** `2026-03` → `20260301` (StoreDate of the first day). */
function firstDayOf(month: string): string {
  return `${month.replace('-', '')}01`;
}

/**
 * Trainer-Abrechnung (spec 1.167): agreements, the trainer's invoice profile, work entries and trainer invoices, plus
 * the callables that preview, send, download, reject and mark an invoice paid.
 *
 * Every list is tenant-scoped (`getSystemQuery`): the rules allow a list only when it filters on the caller's tenant.
 * The books (`accountingTenantId`) always come from the caller (route / store / agreement), never from the app tenant.
 * The client never writes a rate change into a stored rate, an amount, an entry's `state` / `invoiceKey`, or a
 * profile's `nextNumber` / `tenants` — the payload helpers of the util lib keep the writes inside the rules' allowlists.
 * Callable errors are not caught: the caller maps them with `trainerBillingRefusalKey` to a message.
 */
@Injectable({
  providedIn: 'root',
})
export class TrainerBillingService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    agreement_save_conf:  TRAINER_BILLING_I18N_KEYS.agreement_save_conf,
    agreement_save_error: TRAINER_BILLING_I18N_KEYS.agreement_save_error,
    agreement_archive_conf: TRAINER_BILLING_I18N_KEYS.trainers_archive_conf,
    profile_save_conf:    TRAINER_BILLING_I18N_KEYS.profile_save_conf,
    profile_save_error:   TRAINER_BILLING_I18N_KEYS.profile_save_error,
    entry_save_conf:      TRAINER_BILLING_I18N_KEYS.entry_save_conf,
    entry_save_error:     TRAINER_BILLING_I18N_KEYS.entry_save_error,
    entry_delete_conf:    TRAINER_BILLING_I18N_KEYS.entry_delete_conf,
  });

  /*-------------------------- AGREEMENTS --------------------------------*/
  /**
   * The live agreements of one set of books in this tenant (the treasurer's list), newest validity first.
   * Needs the index `trainer-agreements: tenants, isArchived, accountingTenantId, validFrom desc`.
   */
  public listAgreements(accountingTenantId: string): Observable<TrainerAgreementModel[]> {
    if (!accountingTenantId) return of([]);
    return this.firestoreService.searchData<TrainerAgreementModel>(
      TrainerAgreementCollection,
      [...getSystemQuery(this.env.tenantId), { key: 'accountingTenantId', operator: '==', value: accountingTenantId }],
      'validFrom',
      'desc',
    );
  }

  /**
   * The live agreements of one person in this tenant, in all books (the trainer's own view), newest validity first.
   * Needs the index `trainer-agreements: tenants, isArchived, personKey, validFrom desc`.
   */
  public myAgreements(personKey: string): Observable<TrainerAgreementModel[]> {
    if (!personKey) return of([]);
    return this.firestoreService.searchData<TrainerAgreementModel>(
      TrainerAgreementCollection,
      [...getSystemQuery(this.env.tenantId), { key: 'personKey', operator: '==', value: personKey }],
      'validFrom',
      'desc',
    );
  }

  /**
   * Create or update an agreement (treasurer / admin). `personKey` mirrors `person.key`, the search index is rebuilt
   * and the rates are sorted by date. A new agreement belongs to this tenant only (`createModel`).
   * @returns the key of the agreement, or '' when the write failed (a toast has told the user)
   */
  public async saveAgreement(agreement: TrainerAgreementModel, currentUser?: UserModel): Promise<string> {
    if (!agreement.accountingTenantId) die('TrainerBillingService.saveAgreement: accountingTenantId (the books) is mandatory.');
    const payload = trainerAgreementPayload(agreement);
    const key = agreement.okey
      ? await this.firestoreService.updateModel<TrainerAgreementModel>(
          TrainerAgreementCollection, payload, false, this.i18n.agreement_save_conf(), this.i18n.agreement_save_error(), currentUser)
      : await this.firestoreService.createModel<TrainerAgreementModel>(
          TrainerAgreementCollection, payload, this.i18n.agreement_save_conf(), this.i18n.agreement_save_error(), currentUser);
    return key ?? '';
  }

  /**
   * Archive an agreement (treasurer / admin): through `FirestoreService.deleteModel`, which detaches this tenant or,
   * as the last one, sets `isArchived` (deleting-models). Its entries and invoices stay; the list no longer shows it.
   * @returns the key of the agreement, or '' when the write failed (a toast has told the user)
   */
  public async archiveAgreement(agreement: TrainerAgreementModel, currentUser?: UserModel): Promise<string> {
    if (!agreement.okey) die('TrainerBillingService.archiveAgreement: okey is mandatory.');
    const key = await this.firestoreService.deleteModel<TrainerAgreementModel>(
      TrainerAgreementCollection, trainerAgreementPayload(agreement), this.i18n.agreement_archive_conf(), this.i18n.agreement_save_error(), currentUser);
    return key ?? '';
  }

  /*-------------------------- PROFILE --------------------------------*/
  /** The invoice profile of a person (doc id = personKey); `undefined` when there is none yet. */
  public readProfile(personKey: string): Observable<TrainerProfileModel | undefined> {
    if (!personKey) return of(undefined);
    return this.firestoreService.readModel<TrainerProfileModel>(TrainerProfileCollection, personKey);
  }

  /**
   * Save the caller's own profile. An existing profile gets only its editable fields (`nextNumber` and `tenants` are
   * server-maintained; resending a stale copy would fail every save after the first send). A new one is created with
   * `tenants: []` and `nextNumber: 1`, the only values the create rule accepts. When the server cannot say whether the
   * profile exists, it is updated: the agreement trigger creates the profile, so it nearly always does.
   */
  public async saveProfile(personKey: string, profile: TrainerProfileModel): Promise<void> {
    if (!personKey) die('TrainerBillingService.saveProfile: personKey is mandatory.');
    let exists = true;
    try {
      exists = (await this.firestoreService.readObjectStrict<TrainerProfileModel>(`${TrainerProfileCollection}/${personKey}`)) !== null;
    } catch {
      exists = true;
    }
    if (exists) {
      await this.firestoreService.updateFields(
        TrainerProfileCollection, personKey, trainerProfileUpdateFields(profile), this.i18n.profile_save_error(), this.i18n.profile_save_conf());
    } else {
      await this.firestoreService.createObject(
        TrainerProfileCollection, personKey, trainerProfileCreatePayload(profile), this.i18n.profile_save_conf(), this.i18n.profile_save_error());
    }
  }

  /**
   * The caller's own live addresses of one channel (`postal` or `bankaccount`), read once — for the choice in the
   * profile modal. A raw vault read: the owner may read his own addresses (address-model skill). The IBAN stays in the
   * address; the profile keeps only its key (§5.2).
   */
  public async ownAddresses(personKey: string, channel: 'postal' | 'bankaccount'): Promise<AddressModel[]> {
    if (!personKey) return [];
    return this.firestoreService.getDataOnce<AddressModel>(
      AddressCollection,
      [
        ...getSystemQuery(this.env.tenantId),
        { key: 'parentKey', operator: '==', value: `person.${personKey}` },
        { key: 'addressChannel', operator: '==', value: channel },
      ],
      'none',
    );
  }

  /*-------------------------- WORK ENTRIES --------------------------------*/
  /**
   * The entries of one person in one month (`YYYY-MM`), oldest first.
   * Needs the index `work-entries: tenants, isArchived, personKey, date`.
   */
  public myEntries(personKey: string, month: string): Observable<WorkEntryModel[]> {
    if (!personKey || !month) return of([]);
    return this.firestoreService.searchData<WorkEntryModel>(
      WorkEntryCollection,
      [
        ...getSystemQuery(this.env.tenantId),
        { key: 'personKey', operator: '==', value: personKey },
        { key: 'date', operator: '>=', value: firstDayOf(month) },
        { key: 'date', operator: '<=', value: lastDayOfMonth(month) },
      ],
      'date',
      'asc',
    );
  }

  /**
   * The entries of one person at one calendar event (several are allowed, §7.3), oldest first.
   * Needs the index `work-entries: tenants, isArchived, personKey, calEventKey, date`.
   */
  public entriesOfEvent(personKey: string, calEventKey: string): Observable<WorkEntryModel[]> {
    if (!personKey || !calEventKey) return of([]);
    return this.firestoreService.searchData<WorkEntryModel>(
      WorkEntryCollection,
      [
        ...getSystemQuery(this.env.tenantId),
        { key: 'personKey', operator: '==', value: personKey },
        { key: 'calEventKey', operator: '==', value: calEventKey },
      ],
      'date',
      'asc',
    );
  }

  /**
   * Create or update an open entry of the caller. A new entry carries exactly the twelve keys the rules allow, with
   * tenants, books and person from `agreement` (or, without it, from the entry, which the form copied from its
   * agreement), state `open` and no invoice. An update writes only date, event, text, service and quantity — never
   * the agreement, tenants or books.
   * @returns the key of the entry, or '' when the write failed (a toast has told the user)
   */
  public async saveEntry(entry: WorkEntryModel, agreement?: TrainerAgreementModel): Promise<string> {
    if (entry.okey) {
      const key = await this.firestoreService.updateFields(
        WorkEntryCollection, entry.okey, workEntryUpdateFields(entry), this.i18n.entry_save_error(), this.i18n.entry_save_conf());
      return key ?? '';
    }
    const source = agreement ?? { okey: entry.agreementKey, tenants: entry.tenants, accountingTenantId: entry.accountingTenantId, personKey: entry.personKey };
    if (!source.okey || !source.accountingTenantId || !source.personKey) {
      die('TrainerBillingService.saveEntry: agreement, books and person are mandatory.');
    }
    const key = await this.firestoreService.createObject(
      WorkEntryCollection, '', workEntryCreatePayload(entry, source), this.i18n.entry_save_conf(), this.i18n.entry_save_error());
    return key ?? '';
  }

  /** Delete an open entry of the caller (the rules allow it only while `open`; an invoiced entry is frozen). */
  public async deleteEntry(key: string): Promise<void> {
    if (!key) die('TrainerBillingService.deleteEntry: key is mandatory.');
    await this.firestoreService.deleteObject(WorkEntryCollection, key, this.i18n.entry_delete_conf());
  }

  /** The names of calendar events by key (the event an entry was recorded at); an unreadable event is left out, never an error. */
  public eventNames(calEventKeys: string[]): Observable<Record<string, string>> {
    const keys = [...new Set(calEventKeys.filter(k => !!k))];
    if (keys.length === 0) return of({});
    return combineLatest(keys.map(key =>
      this.firestoreService.readModel<CalEventModel>(CalEventCollection, key).pipe(
        take(1),
        map(event => [key, event?.name ?? ''] as const),
        catchError(() => of([key, ''] as const)),   // an unreadable event shows the entry's text instead
      ),
    )).pipe(
      map(pairs => Object.fromEntries(pairs.filter(([, name]) => !!name))),
      catchError(() => of({} as Record<string, string>)),
    );
  }

  /*-------------------------- TRAINER INVOICES (written by the server only) --------------------------------*/
  /**
   * The trainer invoices of one person in this tenant, newest month first.
   * Needs the index `trainer-invoices: tenants, isArchived, personKey, month desc`.
   */
  public myInvoices(personKey: string): Observable<TrainerInvoiceModel[]> {
    if (!personKey) return of([]);
    return this.firestoreService.searchData<TrainerInvoiceModel>(
      TrainerInvoiceCollection,
      [...getSystemQuery(this.env.tenantId), { key: 'personKey', operator: '==', value: personKey }],
      'month',
      'desc',
    );
  }

  /**
   * The trainer invoices of one set of books in this tenant (the treasurer's list), newest month first.
   * Needs the index `trainer-invoices: tenants, isArchived, accountingTenantId, month desc`.
   */
  public invoicesOfBooks(accountingTenantId: string): Observable<TrainerInvoiceModel[]> {
    if (!accountingTenantId) return of([]);
    return this.firestoreService.searchData<TrainerInvoiceModel>(
      TrainerInvoiceCollection,
      [...getSystemQuery(this.env.tenantId), { key: 'accountingTenantId', operator: '==', value: accountingTenantId }],
      'month',
      'desc',
    );
  }

  /*-------------------------- CALLABLES --------------------------------*/
  /** The invoice of an agreement × month as it would be sent, without a number being taken (callable `previewTrainerInvoice`). */
  public async preview(agreementKey: string, month: string): Promise<Blob> {
    if (!agreementKey || !month) die('TrainerBillingService.preview: agreementKey and month are mandatory.');
    return pdfFileOf(await this.callFunction<{ agreementKey: string; month: string }, PdfResult>('previewTrainerInvoice', { agreementKey, month }));
  }

  /** Send the invoice of an agreement × month: numbers it, files the PDF and creates the Kreditor (`sendTrainerInvoice`). */
  public async send(agreementKey: string, month: string): Promise<{ invoiceNo: string }> {
    if (!agreementKey || !month) die('TrainerBillingService.send: agreementKey and month are mandatory.');
    const result = await this.callFunction<{ agreementKey: string; month: string }, { invoiceKey: string; invoiceNo: string; billKey: string }>(
      'sendTrainerInvoice', { agreementKey, month });
    return { invoiceNo: result.invoiceNo };
  }

  /** The PDF of a sent invoice (`downloadTrainerInvoice`); the trainer, treasurer, admin and privileged may read it. */
  public async download(invoiceKey: string): Promise<Blob> {
    if (!invoiceKey) die('TrainerBillingService.download: invoiceKey is mandatory.');
    return pdfFileOf(await this.callFunction<{ invoiceKey: string }, PdfResult>('downloadTrainerInvoice', { invoiceKey }));
  }

  /** Reject a sent invoice with a reason (treasurer / admin, `rejectTrainerInvoice`): the entries reopen, the draft bill goes. */
  public async reject(invoiceKey: string, reason: string): Promise<void> {
    if (!invoiceKey) die('TrainerBillingService.reject: invoiceKey is mandatory.');
    await this.callFunction<{ invoiceKey: string; reason: string }, unknown>('rejectTrainerInvoice', { invoiceKey, reason });
  }

  /** Mark a sent invoice paid (bexio books only, where no Kreditor mirrors the state; `markTrainerInvoicePaid`). */
  public async markPaid(invoiceKey: string): Promise<void> {
    if (!invoiceKey) die('TrainerBillingService.markPaid: invoiceKey is mandatory.');
    await this.callFunction<{ invoiceKey: string }, unknown>('markTrainerInvoicePaid', { invoiceKey });
  }

  /** The `firebase/functions` import is dynamic (as in `CourseService`): SSR-safe and out of the eager bundle. */
  private async callFunction<Req, Res>(name: string, data: Req): Promise<Res> {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const fn = httpsCallable<Req, Res>(getFunctions(undefined, 'europe-west6'), name);
    return (await fn(data)).data;
  }
}

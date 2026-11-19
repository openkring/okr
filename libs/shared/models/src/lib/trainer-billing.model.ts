import { DEFAULT_DATE, DEFAULT_DATETIME, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { OkrModel, SearchableModel, TaggedModel } from './base.model';
import { MoneyModel } from './money.model';

/**
 * Trainer-Abrechnung (spec 1.167): ein Trainer erfasst Einsaetze, der Server erzeugt daraus monatlich eine
 * Rechnung (PDF) und einen Kreditor. Betraege in Rappen, Daten als StoreDate (`yyyyMMdd`), Monate `YYYY-MM`.
 */

/** Einheit einer Leistungsart. */
export type TrainerServiceUnit = 'hour' | 'day';

/** Ein Ansatz ab einem Datum; `TrainerService.rates` ist aufsteigend nach `validFrom` sortiert. */
export type TrainerRate = { validFrom: string; amount: MoneyModel };

/** Leistungsart einer Vereinbarung. Einsaetze verweisen ueber `key` darauf. */
export type TrainerService = {
  key: string; // stable, e.g. 'training', 'regatta'
  name: string; // shown as the service on the invoice
  unit: TrainerServiceUnit;
  rates: TrainerRate[]; // rate history, ascending by validFrom
  accountKey: string; // expense account (leaf); '' → defaultCompensationAccountKey of the books
  costCenterKey: string; // '' → account default, then book default
  vatCodeKey: string; // '' = no VAT
  isArchived: boolean; // no longer selectable, old entries stay valid
};

/**
 * Vereinbarung zwischen Verein (Buecher) und Trainer.
 *
 * ACHTUNG beim Lesen: Firestore liefert rohe Dokumente — spaetere Felder beim Lesen coalescen
 * (`?? ''`, `?? []`).
 */
export class TrainerAgreementModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // app tenant(s)
  public accountingTenantId = ''; // THE BOOKS — never derived from tenantId (accounting skill)
  public person: AvatarInfo | undefined; // the trainer
  public personKey = DEFAULT_KEY; // mirror of person.key for rules and queries
  public validFrom = DEFAULT_DATE; // StoreDate
  public validTo = DEFAULT_DATE; // StoreDate; '' = open
  public selfEmployedConfirmed = false; // D9; false → agreement inactive
  public services: TrainerService[] = [];
  public payablesNote = ''; // optional note of the treasurer, visible to the trainer
  public isArchived = false;
  public index = DEFAULT_INDEX; // for search
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TrainerAgreementCollection = 'trainer-agreements'; // collection name for TrainerAgreementModel
export const TrainerAgreementModelName = 'trainerAgreement';

/**
 * Rechnungsprofil einer Person, Doc-Id = personKey (ein Profil pro Person, fuer alle Vereine). Schreibt nur
 * die Person; `tenants` und `nextNumber` pflegt der Server. Die IBAN wird NICHT kopiert, sie wird beim
 * Rendern aus der `bankaccount`-Adresse gelesen.
 *
 * ACHTUNG beim Lesen: Firestore liefert rohe Dokumente — spaetere Felder beim Lesen coalescen.
 */
export class TrainerProfileModel implements OkrModel {
  public okey = DEFAULT_KEY; // = personKey
  public tenants: string[] = DEFAULT_TENANTS; // all tenants with an agreement of the person; server-maintained
  public companyName = ''; // '' → name of the person
  public contactName = ''; // default = name of the person
  public postalAddressKey = ''; // a postal address of the person (vault) for the letterhead
  public bankAddressKey = ''; // a bank account address of the person (vault, channel bankaccount)
  public logoUrl = ''; // storage path of the logo
  public vatRegistered = false;
  public vatNumber = ''; // UID-MWST, only when vatRegistered
  public vatNote = ''; // shown when not VAT-registered
  public numberTemplate = '{yy}{mm}'; // D6
  public nextNumber = 1; // counter for {n}; only the server increments
  public paymentTermDays = 30;
  public closingText = 'Herzlichen Dank für deinen Auftrag.';
  public showQrSlip = true; // append the QR payment slip
  public isArchived = false; // required by OkrModel; profiles are not archived in practice

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TrainerProfileCollection = 'trainer-profiles'; // collection name for TrainerProfileModel
export const TrainerProfileModelName = 'trainerProfile';

export type WorkEntryState = 'open' | 'invoiced';

/**
 * Ein Einsatz eines Trainers. Kein Ansatz, kein Betrag (D4): beides entsteht erst beim Senden.
 *
 * ACHTUNG beim Lesen: Firestore liefert rohe Dokumente — spaetere Felder beim Lesen coalescen.
 */
export class WorkEntryModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS; // from the agreement
  public accountingTenantId = ''; // from the agreement
  public personKey = DEFAULT_KEY; // whose entry
  public agreementKey = DEFAULT_KEY; // under which agreement
  public date = DEFAULT_DATE; // StoreDate, day of the work
  public calEventKey = ''; // '' = without event
  public label = ''; // place/text for the invoice
  public serviceKey = ''; // service of the agreement
  public quantity = 0; // hours in quarter hours (0.25 steps) or days (whole/half)
  public state: WorkEntryState = 'open'; // 'invoiced' is set by the server only
  public invoiceKey = ''; // trainer invoice once sent
  public isArchived = false;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WorkEntryCollection = 'work-entries'; // collection name for WorkEntryModel
export const WorkEntryModelName = 'workEntry';

export type TrainerInvoiceState = 'sent' | 'rejected' | 'booked' | 'paid';

/** Eingefrorene Rechnungsposition (Rappen). */
export type TrainerInvoiceLine = {
  date: string; // StoreDate
  serviceKey: string;
  serviceName: string;
  label: string;
  quantity: number;
  unit: TrainerServiceUnit;
  rate: number; // Rappen per unit
  amount: number; // Rappen
  workEntryKey: string;
};

/**
 * Gesendete Trainerrechnung. Nur der Server schreibt.
 *
 * ACHTUNG beim Lesen: Firestore liefert rohe Dokumente — spaetere Felder beim Lesen coalescen.
 */
export class TrainerInvoiceModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public accountingTenantId = ''; // THE BOOKS — from the agreement
  public personKey = DEFAULT_KEY;
  public agreementKey = DEFAULT_KEY;
  public month = ''; // YYYY-MM
  public invoiceNo = ''; // D6
  public invoiceDate = DEFAULT_DATE; // StoreDate = day of sending
  public dueDate = DEFAULT_DATE; // StoreDate = invoiceDate + paymentTermDays
  public lines: TrainerInvoiceLine[] = [];
  public subtotal = 0; // Rappen
  public vatAmount = 0; // Rappen
  public total = 0; // Rappen
  public documentKey = ''; // finance-documents okey (the PDF)
  public billKey = ''; // the Kreditor; '' for bexio books
  public state: TrainerInvoiceState = 'sent'; // mirror of the Kreditor, spec §7.6
  public rejectedReason = '';
  public rejectedBy: AvatarInfo | undefined;
  public rejectedAt = DEFAULT_DATETIME; // StoreDateTime
  public isArchived = false; // required by OkrModel; invoices are not archived in practice

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TrainerInvoiceCollection = 'trainer-invoices'; // collection name for TrainerInvoiceModel
export const TrainerInvoiceModelName = 'trainerInvoice';

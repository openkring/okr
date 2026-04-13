import { addDuration, getTodayStr } from '@bk2/shared-util-core';
import { MembershipModel } from '@bk2/shared-models';

export interface BexioInvoicePosition {
  text: string;
  unit_price: string;   // CHF decimal string e.g. "150.00"
  account_id: number;
  amount: string;       // quantity e.g. "1"
}

export interface BexioInvoiceFormModel {
  title: string;
  bexioId: string;      // Bexio contact_id
  header: string;
  footer: string;
  validFrom: string;    // StoreDate yyyyMMdd
  validTo: string;      // StoreDate yyyyMMdd
  template_slug: string;
  positions: BexioInvoicePosition[];
}

export type BexioTemplate = {
  slug: string;
  name: string;
}

/**
 * tbd: read the document_templates from Bexio and make this dynamic.
 */
export const BexioTemplates: BexioTemplate[] = [
  { slug: '5d5c1ae303cf22a15f8b456b', name: 'Standardvorlage' },
  { slug: '609fa0a8a2ed2b15522c02b8', name: 'JB Aktive' },
  { slug: '67ffdf3eb355821a4d0666c5', name: 'JB Aktive - rechts' },
  { slug: '609fa0950083f217027adbc1', name: 'JB Passive' },
  { slug: '67ffdf72eed4ea21dd062435', name: 'JB Passive - rechts' },
];

export function newInvoiceFormModel(membership: MembershipModel): BexioInvoiceFormModel {
  return {
    title: '',
    bexioId: membership.memberBexioId ?? '',
    header: '',
    footer: '',
    validFrom: getTodayStr(),
    validTo: addDuration(getTodayStr(), { days: 30 }),
    template_slug: BexioTemplates[0].slug,
    positions: [],
  };
}

export type DefaultInvoicePosition = {
  id: number,
  name: string,
  text: string,
  unit_price: string,
  account_id: number,
  amount: string
}

/**
 * tbd: read the articles from Bexio and make this dynamic
 */
export const DefaultInvoicePositions: DefaultInvoicePosition[] = [
  { "id": 1, "name": "Aktive A1", "text": "Mitgliedschaft Aktive 1", "unit_price": "50.00", "account_id": 159, "amount": "12"},
  { "id": 2, "name": "Aktive A2", "text": "Mitgliedschaft Aktive 2", "unit_price": "25.00", "account_id": 159, "amount": "12"},
  { "id": 3, "name": "Aktive A3", "text": "Mitgliedschaft Aktive 3", "unit_price": "200.00", "account_id": 159, "amount": "1"},
  { "id": 4, "name": "Jugendliche", "text": "Mitgliedschaft Jugendliche", "unit_price": "25.00", "account_id": 159, "amount": "12"},
  { "id": 5, "name": "Freimitglied", "text": "Mitgliedschaft Freimitglied", "unit_price": "200.00", "account_id": 159, "amount": "1"},
  { "id": 6, "name": "Ehrenmitglied", "text": "Mitgliedschaft Ehrenmitglied", "unit_price": "0.00", "account_id": 159, "amount": "1"},
  { "id": 7, "name": "Passiv", "text": "Mitgliedschaft Passiv", "unit_price": "75.00", "account_id": 159, "amount": "1"},
  { "id": 8, "name": "SRV Beitrag", "text": "Verbandsbeitrag SRV", "unit_price": "75.00", "account_id": 284, "amount": "1"},
  { "id": 9, "name": "Skiff Lagerplatz", "text": "Skiff Lagerplatz", "unit_price": "50.00", "account_id": 286, "amount": "12"},
  { "id": 10, "name": "Garderobe", "text": "Garderoben Kästli", "unit_price": "20.00", "account_id": 286, "amount": "1"},
  { "id": 11, "name": "Eintrittsgebühr", "text": "Eintrittsgebühr (einmalig)", "unit_price": "750.00", "account_id": 158, "amount": "1"},
  { "id": 14, "name": "Getränke 2025", "text": "Getränke 2025", "unit_price": "2.50", "account_id": 306, "amount": "1"},
  { "id": 16, "name": "Clubareal Miete", "text": "Miete für Benutzung Bootshaus", "unit_price": "200.00", "account_id": 287, "amount": "1"},
  { "id": 17, "name": "Aktiv mit Ausbildungsrabatt", "text": "Mitgliedschaft Aktive 1 mit Ausbildungsrabatt 50%", "unit_price": "25.00", "account_id": 159, "amount": "12"},
  { "id": 18, "name": "Kandidierende", "text": "Mitgliedschaft Kandidierende", "unit_price": "50.00", "account_id": 285, "amount": "6"},
  { "id": 19, "name": "SRV Doppelmitgliedschaft", "text": "Verbandsbeitrag SRV Doppelmitglied", "unit_price": "0.00", "account_id": 284, "amount": "1"},
  { "id": 20, "name": "Skiff Versicherung", "text": "Anteil Skiff Versicherung", "unit_price": "50.00", "account_id": 284, "amount": "1"},
  { "id": 21, "name": "Skiffgebühr erlassen", "text": "Skiff Lagerplatz erlassen", "unit_price": "0.00", "account_id": 284, "amount": "1"},
  { "id": 22, "name": "Mahngebühr", "text": "Mahngebühr", "unit_price": "20.00", "account_id": 159, "amount": "1"},
  { "id": 23, "name": "Hallentraining", "text": "Hallentraining Wintersaison 2025/2026", "unit_price": "5.00", "account_id": 289, "amount": "1"},
  { "id": 24, "name": "SRV Jugendliche", "text": "SRV Verbandsbeitrag für Jugendliche", "unit_price": "0.00", "account_id": 284, "amount": "1"},
  { "id": 25, "name": "Familienrabatt", "text": "Familienrabatt gem. Statuten Art. 7.3", "unit_price": "-600.00", "account_id": 159, "amount": "1"},
  { "id": 26, "name": "Custom", "text": "", "unit_price": "1", "account_id": 0, "amount": "1"}
];

export function defaultInvoicePositionToBexio(def: DefaultInvoicePosition): BexioInvoicePosition {
  return { text: def.text, unit_price: def.unit_price, account_id: def.account_id, amount: def.amount };
}


// tbd: Accounts and AccountGroups
// tbd: sync accounts and accountGroups from Bexio and make this dynamic
export type BookingAccount = {
  id: number,
  uuid: string,
  accountNr: string,
  name: string,
  accountType: number,
  accountGroupId: number
}

export type BookingAccountGroup = {
  id: number,
  uuid: string,
  accountNr: string,
  name: string
}
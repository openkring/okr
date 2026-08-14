import { AccountModel } from '@okr/shared-models';

import { getAccountIndex } from './account.util';

/**
 * Swiss KMU chart of accounts (Kontenrahmen KMU, Sterchi/Käfer), abridged to the accounts a club or
 * SME actually books on. Rows are `[number, name, parentNumber]` — the parent is spelled out rather
 * than derived from the number, because the official numbering groups by *range* (10 Umlaufvermögen
 * covers 100–139), not by prefix. `''` as parent means "directly under the chart's root".
 * The account type (group vs. leaf) is derived: a row that is somebody's parent is a group.
 */
export const CH_KMU_ACCOUNTS: [id: string, name: string, parentId: string][] = [
  ['1', 'Aktiven', ''],
  ['10', 'Umlaufvermögen', '1'],
  ['100', 'Flüssige Mittel', '10'],
  ['1000', 'Kasse', '100'],
  ['1020', 'Bank', '100'],
  ['106', 'Kurzfristig gehaltene Aktiven mit Börsenkurs', '10'],
  ['1060', 'Wertschriften', '106'],
  ['110', 'Forderungen aus Lieferungen und Leistungen', '10'],
  ['1100', 'Forderungen aus Lieferungen und Leistungen', '110'],
  ['1109', 'Delkredere', '110'],
  ['114', 'Übrige kurzfristige Forderungen', '10'],
  ['1140', 'Vorschüsse und Darlehen', '114'],
  ['1170', 'Vorsteuer MWST Material, Waren und Dienstleistungen', '114'],
  ['1171', 'Vorsteuer MWST Investitionen und übriger Betriebsaufwand', '114'],
  ['1176', 'Verrechnungssteuer', '114'],
  ['120', 'Vorräte', '10'],
  ['1200', 'Handelswaren', '120'],
  ['1260', 'Fertige Erzeugnisse', '120'],
  ['130', 'Aktive Rechnungsabgrenzungen', '10'],
  ['1300', 'Bezahlter Aufwand des Folgejahres', '130'],
  ['1301', 'Noch nicht erhaltener Ertrag', '130'],
  ['14', 'Anlagevermögen', '1'],
  ['140', 'Finanzanlagen', '14'],
  ['1400', 'Wertschriften', '140'],
  ['150', 'Mobile Sachanlagen', '14'],
  ['1500', 'Maschinen und Apparate', '150'],
  ['1510', 'Mobiliar und Einrichtungen', '150'],
  ['1520', 'Büromaschinen, Informatik, Kommunikation', '150'],
  ['1530', 'Fahrzeuge', '150'],
  ['160', 'Immobile Sachanlagen', '14'],
  ['1600', 'Immobilien', '160'],
  ['170', 'Immaterielle Werte', '14'],
  ['1700', 'Immaterielle Anlagen', '170'],

  ['2', 'Passiven', ''],
  ['20', 'Kurzfristiges Fremdkapital', ''],
  ['200', 'Verbindlichkeiten aus Lieferungen und Leistungen', '20'],
  ['2000', 'Verbindlichkeiten aus Lieferungen und Leistungen', '200'],
  ['210', 'Kurzfristige verzinsliche Verbindlichkeiten', '20'],
  ['2100', 'Bankverbindlichkeiten', '210'],
  ['220', 'Übrige kurzfristige Verbindlichkeiten', '20'],
  ['2200', 'Umsatzsteuer MWST', '220'],
  ['2201', 'Abrechnungskonto MWST', '220'],
  ['2206', 'Verrechnungssteuer', '220'],
  ['2210', 'Übrige kurzfristige Verbindlichkeiten', '220'],
  ['2261', 'Beschlossene Ausschüttungen', '220'],
  ['2270', 'Sozialversicherungen und Vorsorgeeinrichtungen', '220'],
  ['230', 'Passive Rechnungsabgrenzungen', '20'],
  ['2300', 'Noch nicht bezahlter Aufwand', '230'],
  ['2301', 'Erhaltener Ertrag des Folgejahres', '230'],
  ['24', 'Langfristiges Fremdkapital', ''],
  ['240', 'Langfristige verzinsliche Verbindlichkeiten', '24'],
  ['2400', 'Bankdarlehen', '240'],
  ['2450', 'Darlehen', '240'],
  ['250', 'Übrige langfristige Verbindlichkeiten', '24'],
  ['2500', 'Andere langfristige Verbindlichkeiten', '250'],
  ['260', 'Rückstellungen', '24'],
  ['2600', 'Rückstellungen', '260'],
  ['28', 'Eigenkapital', ''],
  ['2800', 'Grund-, Vereins- oder Stiftungskapital', '28'],
  ['2900', 'Gesetzliche Gewinnreserve', '28'],
  ['2970', 'Gewinnvortrag / Verlustvortrag', '28'],
  ['2979', 'Jahresgewinn / Jahresverlust', '28'],

  ['3', 'Betriebsertrag', ''],
  ['3000', 'Produktionserlöse', '3'],
  ['3200', 'Handelserlöse', '3'],
  ['3400', 'Dienstleistungserlöse', '3'],
  ['3600', 'Übrige Erlöse', '3'],
  ['3700', 'Mitgliederbeiträge', '3'],
  ['3710', 'Spenden und Sponsoring', '3'],
  ['3800', 'Erlösminderungen', '3'],
  ['3805', 'Verluste aus Forderungen', '3'],

  ['4', 'Aufwand für Material, Waren und Dienstleistungen', ''],
  ['4000', 'Materialaufwand', '4'],
  ['4200', 'Handelswarenaufwand', '4'],
  ['4400', 'Aufwand für Drittleistungen', '4'],
  ['4900', 'Aufwandminderungen', '4'],

  ['5', 'Personalaufwand', ''],
  ['5000', 'Lohnaufwand', '5'],
  ['5700', 'Sozialversicherungsaufwand', '5'],
  ['5800', 'Übriger Personalaufwand', '5'],
  ['5900', 'Leistungen Dritter', '5'],

  ['6', 'Sonstiger Betriebsaufwand', ''],
  ['6000', 'Raumaufwand', '6'],
  ['6100', 'Unterhalt, Reparaturen, Ersatz', '6'],
  ['6200', 'Fahrzeug- und Transportaufwand', '6'],
  ['6300', 'Sachversicherungen, Abgaben, Gebühren', '6'],
  ['6400', 'Energie- und Entsorgungsaufwand', '6'],
  ['6500', 'Verwaltungsaufwand', '6'],
  ['6510', 'Informatikaufwand', '6'],
  ['6570', 'Anlässe und Veranstaltungen', '6'],
  ['6600', 'Werbeaufwand', '6'],
  ['6700', 'Übriger Betriebsaufwand', '6'],
  ['6800', 'Abschreibungen', '6'],
  ['6900', 'Finanzaufwand', '6'],
  ['6950', 'Finanzertrag', '6'],

  ['7', 'Betriebliches Nebenergebnis', ''],
  ['7000', 'Ertrag Nebenbetrieb', '7'],
  ['7010', 'Aufwand Nebenbetrieb', '7'],

  ['8', 'Ausserordentliches und betriebsfremdes Ergebnis', ''],
  ['8000', 'Ausserordentlicher Ertrag', '8'],
  ['8010', 'Ausserordentlicher Aufwand', '8'],
  ['8900', 'Direkte Steuern', '8'],

  ['9', 'Abschluss', ''],
  ['9200', 'Jahresgewinn / Jahresverlust', '9'],
];

/** Stable okey of a seeded account, so re-seeding overwrites instead of duplicating. */
export function getSeededAccountKey(accountingTenantId: string, id: string): string {
  return `${accountingTenantId}-${id || 'root'}`;
}

/**
 * Expand {@link CH_KMU_ACCOUNTS} into ready-to-store AccountModels: one root plus one account per
 * row, wired by parentKey.
 */
export function buildChartOfAccounts(
  tenantId: string,
  accountingTenantId: string,
  rootName = 'Kontenrahmen KMU',
  rows = CH_KMU_ACCOUNTS
): AccountModel[] {
  const parentIds = new Set(rows.map(([, , parentId]) => parentId));

  const build = (id: string, name: string, type: string, parentKey: string): AccountModel => {
    const account = new AccountModel(tenantId);
    account.okey = getSeededAccountKey(accountingTenantId, id);
    account.accountingTenantId = accountingTenantId;
    account.id = id;
    account.name = name;
    account.type = type;
    account.parentKey = parentKey;
    account.index = getAccountIndex(account);
    return account;
  };

  const rootKey = getSeededAccountKey(accountingTenantId, '');
  const root = build('', rootName, 'root', '');
  const accounts = rows.map(([id, name, parentId]) =>
    build(id, name, parentIds.has(id) ? 'group' : 'leaf',
      parentId ? getSeededAccountKey(accountingTenantId, parentId) : rootKey));

  return [root, ...accounts];
}

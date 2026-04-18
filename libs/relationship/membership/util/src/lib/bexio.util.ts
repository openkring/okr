export interface BexioAccount {
  id: number;
  account_no: string;
  name: string;
}

export const BEXIO_ACCOUNTS: BexioAccount[] = [
  { id: 281, account_no: '1000', name: 'Kassenkonto Kasse CHF' },
  { id: 298, account_no: '1010', name: 'Post CH54 0900 0000 8002 2463 3' },
  { id: 77,  account_no: '1020', name: 'Bank ZKB CH67 0070 0110 4044 7417 CHF (Zürcher Kantonalbank)' },
  { id: 89,  account_no: '1029', name: 'Bank' },
  { id: 93,  account_no: '1100', name: 'Debitoren' },
  { id: 95,  account_no: '1170', name: 'Vorsteuer Material, Waren, Dienstleistungen, Energie, Kl. 4' },
  { id: 96,  account_no: '1171', name: 'Vorsteuer Investitionen, übriger Betriebsaufwand, Kl. 1/5-8' },
  { id: 97,  account_no: '1172', name: 'Vorsteuerausgleich Abrechnungsmethode' },
  { id: 98,  account_no: '1173', name: 'Vorsteuerkürzung' },
  { id: 99,  account_no: '1174', name: 'Vorsteuerkorrektur' },
  { id: 110, account_no: '1300', name: 'Bezahlter Aufwand des Folgejahrs (TA)' },
  { id: 111, account_no: '1301', name: 'Noch nicht erhaltener Ertrag (TA)' },
  { id: 112, account_no: '1500', name: 'Maschinen und Apparate' },
  { id: 113, account_no: '1510', name: 'Mobiliar und Einrichtungen' },
  { id: 118, account_no: '1530', name: 'Bootsanhänger' },
  { id: 116, account_no: '1531', name: 'Bootspark' },
  { id: 283, account_no: '1600', name: 'Liegenschaft' },
  { id: 121, account_no: '2000', name: 'Kreditoren' },
  { id: 126, account_no: '2200', name: 'Geschuldete MWST (Umsatzsteuer)' },
  { id: 127, account_no: '2201', name: 'Abrechnungskonto MWST' },
  { id: 128, account_no: '2202', name: 'Umsatzsteuerausgleich Abrechnungsmethode' },
  { id: 129, account_no: '2203', name: 'Bezugsteuer' },
  { id: 137, account_no: '2300', name: 'Noch nicht bezahlter Aufwand (TP)' },
  { id: 138, account_no: '2301', name: 'Erhaltener Ertrag des Folgejahrs (TP)' },
  { id: 140, account_no: '2400', name: 'Darlehen' },
  { id: 122, account_no: '2450', name: 'Zinslose Darlehen Mitglieder' },
  { id: 141, account_no: '2451', name: 'Hypothek' },
  { id: 299, account_no: '2210', name: 'Schlüsseldepot' },
  { id: 300, account_no: '2601', name: 'Fonds Bus' },
  { id: 311, account_no: '2440', name: 'Fonds neues Bootshaus' },
  { id: 301, account_no: '2801', name: 'Erneuerungsfonds Bootshaus' },
  { id: 143, account_no: '2800', name: 'Eigenkapital zu Beginn des Geschäftsjahrs' },
  { id: 152, account_no: '2970', name: 'Gewinn-/Verlustvortrag' },
  { id: 154, account_no: '3201', name: 'Bruttoerlöse Kreditverkäufe' },
  { id: 158, account_no: '3400', name: 'Eintrittsgebühren' },
  { id: 159, account_no: '3401', name: 'Mitgliederbeiträge' },
  { id: 160, account_no: '3407', name: 'Spenden' },
  { id: 161, account_no: '3408', name: 'Beiträge von Swisslos' },
  { id: 284, account_no: '3402', name: 'SRV-Beitrag der Mitglieder' },
  { id: 285, account_no: '3403', name: 'Kandidatenbeiträge' },
  { id: 286, account_no: '3404', name: 'Vermietung Bootslager und Kästli' },
  { id: 287, account_no: '3405', name: 'Vermietung Bootshaus' },
  { id: 288, account_no: '3406', name: 'Subventionen von Altherren' },
  { id: 165, account_no: '3680', name: 'Sonstige Erlöse' },
  { id: 166, account_no: '3800', name: 'Skonti' },
  { id: 173, account_no: '3809', name: 'MWST Saldosteuersatz' },
  { id: 289, account_no: '3410', name: 'Ertrag Kurse' },
  { id: 290, account_no: '3411', name: 'Ertrag Regatta' },
  { id: 291, account_no: '3412', name: 'Ertrag Clubzeitung' },
  { id: 292, account_no: '3409', name: 'Einnahmen Jugendbetreuung' },
  { id: 305, account_no: '3413', name: 'Lizenzbeiträge der Mitglieder' },
  { id: 306, account_no: '3414', name: 'Getränkezahlungen der Mitglieder' },
  { id: 308, account_no: '3415', name: 'Ertrag Tenüverkäufe' },
  { id: 310, account_no: '3416', name: 'Spenden Bootshaus' },
  { id: 312, account_no: '3417', name: 'Ertrag Herbstfest' },
  { id: 174, account_no: '4200', name: 'Aufwand Tenüs' },
  { id: 302, account_no: '4201', name: 'Getränke' },
  { id: 179, account_no: '4400', name: 'Aufwand Regatta' },
  { id: 180, account_no: '4401', name: 'Aufwand SRV' },
  { id: 303, account_no: '4402', name: 'Ausbildungen, Kurse' },
  { id: 304, account_no: '4403', name: 'Lizenzen' },
  { id: 309, account_no: '4404', name: 'Breitensport' },
  { id: 314, account_no: '4405', name: 'SRV Athleten-SB' },
  { id: 185, account_no: '4900', name: 'Skonti' },
  { id: 295, account_no: '4010', name: 'Anschaffung Boote' },
  { id: 296, account_no: '4012', name: 'Anschaffung Sportgeräte' },
  { id: 297, account_no: '4020', name: 'Umbau Bootshaus' },
  { id: 315, account_no: '4021', name: 'Veränderung Fondskapital Bootshaus' },
  { id: 190, account_no: '5000', name: 'Trainerentschädigungen' },
  { id: 196, account_no: '5700', name: 'AHV, IV, EO, ALV, UVG' },
  { id: 218, account_no: '6050', name: 'Unterhalt Bootshaus, Ponton' },
  { id: 293, account_no: '6100', name: 'Reinigung, Kehricht' },
  { id: 221, account_no: '6101', name: 'URE Werkzeug, Geräte' },
  { id: 223, account_no: '6200', name: 'Bootsunterhalt' },
  { id: 224, account_no: '6210', name: 'Unterhalt Motorboot, Maschinen' },
  { id: 225, account_no: '6220', name: 'MFZ Versicherungen' },
  { id: 226, account_no: '6230', name: 'Abgaben, Gebühren, Bewilligungen' },
  { id: 228, account_no: '6264', name: 'Transportkosten / Fz Miete' },
  { id: 231, account_no: '6300', name: 'Sachversicherungen' },
  { id: 232, account_no: '6360', name: 'Verbandsbeiträge' },
  { id: 233, account_no: '6400', name: 'Elektrizität, Gas, Heizöl, Wasser' },
  { id: 307, account_no: '6410', name: 'Treibstoff' },
  { id: 235, account_no: '6500', name: 'Büromaterial' },
  { id: 236, account_no: '6503', name: 'Fachliteratur, Zeitungen, Zeitschriften' },
  { id: 237, account_no: '6510', name: 'Telefon' },
  { id: 238, account_no: '6512', name: 'Internet' },
  { id: 239, account_no: '6513', name: 'Porti' },
  { id: 241, account_no: '6530', name: 'Buchführung' },
  { id: 243, account_no: '6559', name: 'Sonstiger Verwaltungsaufwand' },
  { id: 244, account_no: '6570', name: 'Leasing und Miete Hard- und Software' },
  { id: 245, account_no: '6600', name: 'Homepage, Website' },
  { id: 246, account_no: '6610', name: 'Clubzeitung Stüürbord' },
  { id: 251, account_no: '6670', name: 'Anlässe (HV, GV, Clubregatta etc.)' },
  { id: 313, account_no: '6671', name: 'Aufwand Herbstfest' },
  { id: 256, account_no: '6700', name: 'Diverse Ausgaben' },
  { id: 257, account_no: '6800', name: 'Abschreibung Liegenschaft' },
  { id: 258, account_no: '6900', name: 'Hypothekenzins' },
  { id: 260, account_no: '6940', name: 'Bankspesen' },
  { id: 261, account_no: '6945', name: 'Rundungsdifferenz Debitoren/Kreditoren' },
  { id: 262, account_no: '6949', name: 'Währungsverluste' },
  { id: 263, account_no: '6950', name: 'Zinsen netto' },
  { id: 265, account_no: '6999', name: 'Währungsgewinne' },
  { id: 266, account_no: '7000', name: 'Bruttoertrag' },
  { id: 269, account_no: '8500', name: 'Ausserordentliche Reservenbildung' },
  { id: 270, account_no: '8600', name: 'Einmaliger Aufwand' },
  { id: 271, account_no: '8610', name: 'Einmaliger Ertrag' },
  { id: 272, account_no: '8709', name: 'Übriger periodenfremder Aufwand' },
  { id: 273, account_no: '8719', name: 'Übriger periodenfremder Ertrag' },
  { id: 274, account_no: '8900', name: 'Kantons- und Gemeindesteuern' },
  { id: 275, account_no: '8901', name: 'Direkte Bundessteuern' },
  { id: 276, account_no: '9000', name: 'Erfolgsrechnung' },
  { id: 277, account_no: '9100', name: 'Eröffnungsbilanz' },
  { id: 278, account_no: '9101', name: 'Schlussbilanz' },
  { id: 279, account_no: '9200', name: 'Jahresgewinn oder Jahresverlust' },
  { id: 280, account_no: '9900', name: 'Korrekturen' },
  { id: 294, account_no: '9901', name: 'Saldoübernahme' },
];

const _accountById = new Map<number, BexioAccount>(
  BEXIO_ACCOUNTS.map(a => [a.id, a])
);

/**
 * Returns 'account_no / name' for a given Bexio account ID.
 * Returns the ID as a string if not found.
 */
export function getAccountDescription(accountId: number): string {
  const account = _accountById.get(accountId);
  return account ? `${account.account_no} / ${account.name}` : String(accountId);
}


/**
 * 
 * This is a workaround to be able to quickly deploy the templates.
 * tbd: these template need to be loaded dynamically from Bexio with https://api.bexio.com/3.0/document_templates
 */

export interface InvoiceTemplate {
  id: string;
  name: string;
}

export const BEXIO_INVOICE_TEMPLATES: InvoiceTemplate[] = [
  { id: '609fa0a8a2ed2b15522c02b8', name: 'JB Aktive' },
  { id: '67ffdf3eb355821a4d0666c5', name: 'JB Aktive - rechts' },
  { id: '609fa0950083f217027adbc1', name: 'JB Passive' },
  { id: '67ffdf72eed4ea21dd062435', name: 'JB Passive - rechts' },
  { id: '5d5c1ae303cf22a15f8b456b', name: 'Standardrechnung' }
];
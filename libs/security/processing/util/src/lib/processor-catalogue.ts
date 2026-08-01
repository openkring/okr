import type { AppConfig, ProcessorEntry } from '@okr/shared-models';

/**
 * The Bearbeitungsverzeichnis catalogue — every third party that can receive personal
 * data from this platform, as a typed constant versioned in git (D-P5-5, spec 1.19
 * Phase 5C). There is no `subprocessors` collection and no repo scanner: the catalogue
 * lives next to the code that talks to each provider, and privacy-audit **check 6**
 * (register drift) is what keeps it honest — an integration switched on in
 * `AppConfig.integrations` with no entry here is an error finding.
 *
 * ## Two rules for editing this file, both non-negotiable
 *
 * 1. **Never invent a DPA or privacy URL.** Every link below was opened and confirmed to
 *    resolve to that provider's actual document (verified 2026-08-01). If a provider
 *    publishes no DPA, the field stays `''` — audit check 5 then reports the gap, which
 *    is the honest outcome. A fabricated legal reference is worse than an empty field:
 *    the empty one is caught by the audit, the fabricated one is not, and it is the field
 *    an auditor reads first.
 * 2. **Never invent an enablement flag.** A gated entry's predicate reads
 *    `AppConfig.integrations[key]`; where a real flag already exists (search.ch has
 *    `personLookupEnabled`) the predicate honours it as well.
 *
 * Seeded from `planning/reference/privacy-data-inventory.md` §4 plus the always-on
 * platform layer. `purposes`, `securityMeasures` and `retentionText` are **German legal
 * text rendered verbatim** — they are data, not i18n keys.
 */
export interface CatalogueEntry extends ProcessorEntry {
  /**
   * `true` = every tenant transfers to this party and it has no `integrations` key: the
   * platform cannot run without it. These keys are deliberately absent from
   * `INTEGRATION_KEYS`, so check 6 never demands a flag for them.
   */
  readonly alwaysOn?: boolean;
  /** Only on gated entries. `activeProcessors` strips it before the entry is rendered. */
  readonly enabledWhen?: (config: AppConfig) => boolean;
  /**
   * Which of *our* Cloud Functions actually perform the transfer — from inventory §4,
   * kept next to the entry so adding a caller forces the register to be revisited.
   * Rendered on the detail page.
   */
  readonly cloudFunctions: readonly string[];
  /**
   * What the erasure report tells the **member**, in German, addressed to them.
   *
   * Distinct from `contact` on purpose. `contact` is the provider's own data-protection
   * address and belongs in the register, which an auditor reads. But for a processor
   * acting on the club's instruction the correct advice to a member is "go through the
   * club" — that is what "processor" means — and for the chat server the honest sentence
   * is that this erasure does not touch the message bodies at all. Putting a bare
   * provider e-mail in the report would be technically true and practically useless.
   */
  readonly memberNoticeDe: string;
}

/** Standard predicate: the tenant switched this integration on. */
const byIntegration = (key: string) => (config: AppConfig) => config?.integrations?.[key] === true;

export const PROCESSOR_CATALOGUE: readonly CatalogueEntry[] = [
  // ── Always-on platform layer ────────────────────────────────────────────────────────
  {
    key: 'firebase',
    name: 'Google Firebase / Google Cloud',
    legalEntity: 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, IE',
    role: 'subProcessor',
    category: 'infrastructure',
    country: 'IE',
    transferMechanism: 'adequacyDecision',
    purposes: [
      'Betrieb der Datenbank (Firestore), der Authentifizierung und des Dateispeichers',
      'Ausführung der serverseitigen Funktionen (Cloud Functions)',
    ],
    dataClasses: ['identity', 'contact', 'membership', 'financial', 'communication', 'content', 'consent', 'log'],
    retentionText: 'Für die Dauer der Nutzung; Backups gemäss Point-in-Time-Recovery (7 Tage)',
    securityMeasures: [
      'Verschlüsselung bei Übertragung und Speicherung',
      'Zugriffskontrolle über Firebase Authentication und Firestore Security Rules',
      'Verarbeitung in der Region europe-west6 (Zürich)',
      'App Check gegen missbräuchliche Zugriffe',
    ],
    dpaUrl: 'https://firebase.google.com/terms/data-processing-terms',
    privacyUrl: 'https://policies.google.com/privacy',
    contact: 'google_ireland_dprep@vischer.com',
    alwaysOn: true,
    cloudFunctions: ['alle'],
    memberNoticeDe:
      'Die Vereinsdaten liegen auf der Infrastruktur von Google in der Region Zürich. Gelöschte Daten verschwinden dort mit der Löschung; in den Sicherungskopien bleiben sie noch bis zu 7 Tage bestehen und werden danach automatisch überschrieben.',
  },
  {
    key: 'fcm',
    name: 'Firebase Cloud Messaging (Push-Nachrichten)',
    legalEntity: 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, IE',
    role: 'subProcessor',
    category: 'infrastructure',
    country: 'IE',
    transferMechanism: 'adequacyDecision',
    purposes: ['Zustellung von Push-Nachrichten an die Geräte der Mitglieder'],
    // The notification title/body carries sender names and message text — that is the
    // personal data here, not the device token.
    dataClasses: ['identity', 'communication'],
    retentionText: 'Nachrichten werden nur bis zur Zustellung zwischengespeichert (max. 28 Tage)',
    securityMeasures: [
      'Verschlüsselte Übertragung',
      'Gerätetoken statt Klarnamen als Empfängeradresse',
    ],
    dpaUrl: 'https://firebase.google.com/terms/data-processing-terms',
    privacyUrl: 'https://policies.google.com/privacy',
    contact: 'google_ireland_dprep@vischer.com',
    alwaysOn: true,
    cloudFunctions: ['matrix-simple/push.ts', 'task/index.ts'],
    memberNoticeDe:
      'Bereits zugestellte Push-Nachrichten lassen sich nicht zurückholen. Sie verbleiben auf deinem Gerät, bis du sie dort entfernst.',
  },
  {
    key: 'mailtrap',
    name: 'Mailtrap (E-Mail-Versand)',
    legalEntity: 'Railsware Products Studio LLC (Mailtrap), 117 E Colorado Blvd, Pasadena CA, US',
    role: 'processor',
    category: 'saasService',
    country: 'US',
    transferMechanism: 'scc',
    purposes: [
      'Versand von Transaktions-E-Mails (Registrierung, Passwort-Zurücksetzung, Benachrichtigungen)',
      'Versand von Dokumenten als E-Mail-Anhang',
    ],
    dataClasses: ['identity', 'contact', 'communication', 'content'],
    retentionText: 'Zustellprotokolle beim Anbieter gemäss dessen Aufbewahrungsfristen',
    securityMeasures: [
      'TLS-verschlüsselte Übertragung',
      'API-Schlüssel serverseitig im Secret Manager, nie im Client',
    ],
    dpaUrl: 'https://mailtrap.io/dpa/',
    privacyUrl: 'https://mailtrap.io/privacy/',
    contact: 'privacy@mailtrap.io',
    // E-Mail ist nicht abwählbar: ohne sie gibt es keine Registrierung und kein
    // Passwort-Zurücksetzen.
    alwaysOn: true,
    cloudFunctions: ['auth/sendEmail', 'esign/esign-send-by-email', 'publicApi/contact'],
    memberNoticeDe:
      'Bereits versandte E-Mails lassen sich nicht zurückholen. Die Zustellprotokolle beim Versanddienst löschen sich nach dessen eigener Frist.',
  },
  {
    key: 'sentry',
    name: 'Sentry (Fehlerprotokollierung)',
    legalEntity: 'Functional Software, Inc. d/b/a Sentry, 45 Fremont Street, San Francisco CA, US',
    role: 'subProcessor',
    category: 'infrastructure',
    country: 'US',
    transferMechanism: 'scc',
    purposes: ['Erfassung von Programmfehlern zur Behebung von Störungen'],
    dataClasses: ['identity', 'log'],
    retentionText: 'Fehlerereignisse 90 Tage',
    securityMeasures: [
      'Verschlüsselte Übertragung',
      'Standardvertragsklauseln gemäss Auftragsverarbeitungsvertrag',
    ],
    dpaUrl: 'https://sentry.io/legal/dpa/',
    privacyUrl: 'https://sentry.io/privacy/',
    contact: 'compliance@sentry.io',
    alwaysOn: true,
    cloudFunctions: [],
    memberNoticeDe:
      'Bei einem Programmfehler wird ein technisches Protokoll erstellt, das deine Benutzerkennung enthalten kann. Diese Protokolle löschen sich nach 90 Tagen automatisch.',
  },
  {
    key: 'imgix',
    name: 'imgix (Bildauslieferung)',
    legalEntity: 'Imgix, Inc., 535 Mission St, San Francisco CA, US',
    role: 'subProcessor',
    category: 'infrastructure',
    country: 'US',
    // Imgix ist unter dem Swiss-U.S. Data Privacy Framework zertifiziert; die Schweiz
    // anerkennt das DPF seit dem 15. September 2024 als angemessenen Schutz.
    transferMechanism: 'adequacyDecision',
    purposes: ['Auslieferung und Grössenanpassung von Profil- und Inhaltsbildern'],
    dataClasses: ['identity', 'content'],
    retentionText: 'Zwischenspeicher (Cache) des Anbieters; Originalbilder bleiben bei Firebase Storage',
    securityMeasures: [
      'Auslieferung ausschliesslich über HTTPS',
      'Zertifizierung unter dem Swiss-U.S. Data Privacy Framework',
    ],
    dpaUrl: 'https://www.imgix.com/data-processing-agreement',
    privacyUrl: 'https://www.imgix.com/privacy',
    contact: 'privacy@imgix.com',
    alwaysOn: true,
    cloudFunctions: [],
    memberNoticeDe:
      'Dein Profilbild wird über einen Bilddienst ausgeliefert, der Kopien zwischenspeichert. Diese Zwischenspeicher laufen nach dem Löschen des Originals von selbst ab.',
  },

  // ── Integrations gated by AppConfig.integrations ────────────────────────────────────
  {
    key: 'bexio',
    name: 'bexio (Buchhaltung und Rechnungsstellung)',
    legalEntity: 'bexio AG, Alte Jonastrasse 24, 8640 Rapperswil, CH',
    role: 'processor',
    category: 'saasService',
    country: 'CH',
    transferMechanism: 'domestic',
    purposes: [
      'Rechnungsstellung und Debitorenbuchhaltung',
      'Abgleich der Kontaktdaten zahlungspflichtiger Mitglieder',
    ],
    dataClasses: ['identity', 'contact', 'financial'],
    retentionText: '10 Jahre (Aufbewahrungspflicht nach OR Art. 958f / GebüV)',
    securityMeasures: [
      'Verschlüsselte Übertragung über die bexio-API',
      'API-Schlüssel serverseitig im Secret Manager, nie im Client',
      'Datenhaltung in der Schweiz',
    ],
    dpaUrl: 'https://cdn.www.bexio.com/assets/content_craft/documents/legal/auftragsbearbeitungsvertrag_DE.pdf',
    privacyUrl: 'https://www.bexio.com/de-CH/richtlinien/datenschutz',
    contact: 'datenschutz@bexio.com',
    enabledWhen: byIntegration('bexio'),
    cloudFunctions: ['bexio/contact.ts', 'bexio/invoice.ts'],
    memberNoticeDe:
      'Über die Datenschutz-Kontaktstelle des Vereins (siehe Impressum). Rechnungen unterliegen dort derselben zehnjährigen Aufbewahrungspflicht wie bei uns.',
  },
  {
    key: 'deepsign',
    name: 'DeepSign (elektronische Signatur)',
    legalEntity: 'DeepCloud AG, Abacus-Platz 1, 9300 Wittenbach, CH',
    role: 'processor',
    category: 'saasService',
    country: 'CH',
    transferMechanism: 'domestic',
    purposes: ['Elektronische Signatur von Verträgen und Vereinbarungen'],
    dataClasses: ['identity', 'contact', 'content'],
    retentionText: 'Bis zum Abschluss des Signaturvorgangs; danach gemäss Anbieter',
    securityMeasures: [
      'Qualifizierte elektronische Signatur nach ZertES',
      'Verschlüsselte Übertragung',
      'Datenhaltung in der Schweiz',
    ],
    // DeepCloud bestätigt in der Datenschutzerklärung, dass ein Auftragsdatenverarbeitungs-
    // vertrag abgeschlossen wird, veröffentlicht dafür aber keine Kunden-URL. Bewusst leer
    // gelassen — Prüfung 5 meldet die Lücke, statt hier einen erfundenen Link zu führen.
    dpaUrl: '',
    privacyUrl: 'https://www.deepcloud.swiss/datenschutz/',
    contact: 'datenschutz@deepcloud.swiss',
    enabledWhen: byIntegration('deepsign'),
    cloudFunctions: ['esign/*'],
    memberNoticeDe:
      'Über die Datenschutz-Kontaktstelle des Vereins (siehe Impressum). Bereits signierte Dokumente bleiben als Beweismittel unverändert bestehen.',
  },
  {
    key: 'matrix',
    name: 'Matrix-Chat (etke.cc, gehosteter Synapse-Server)',
    legalEntity: 'Etke, Sociedade Unipessoal, LDA, Rua Humberto Cruz 705, 4450-696 Leça da Palmeira, PT',
    role: 'processor',
    category: 'saasService',
    // Vertragspartnerin sitzt in Portugal; die Server stehen laut Anbieter bei Hetzner in
    // Deutschland. Beides innerhalb des EWR.
    country: 'PT',
    transferMechanism: 'adequacyDecision',
    purposes: [
      'Betrieb des Vereinschats (Räume, Mitgliedschaften, Nachrichten)',
      'Anzeige von Namen und Profilbildern der Chat-Teilnehmenden',
    ],
    dataClasses: ['identity', 'communication', 'content'],
    retentionText: 'Nachrichten bleiben auf dem Homeserver, bis sie gelöscht werden',
    securityMeasures: [
      'Verschlüsselte Übertragung',
      'Serverstandort Deutschland (Hetzner)',
      'Administrativer Zugriff nur über ein serverseitig gehaltenes Admin-Token',
    ],
    // etke.cc veröffentlicht keinen Auftragsverarbeitungsvertrag. Bewusst leer — Prüfung 5
    // meldet die Lücke. Hinweis: Chat-Inhalte sind von einer Löschung nicht erreichbar.
    dpaUrl: '',
    privacyUrl: 'https://etke.cc/privacy/',
    contact: 'https://etke.cc/contacts/',
    enabledWhen: byIntegration('matrix'),
    cloudFunctions: ['matrix-simple/*'],
    memberNoticeDe:
      'Die Inhalte deiner Chatnachrichten liegen auf dem Chatserver und werden durch diese Löschung nicht entfernt. Wende dich dafür an die Datenschutz-Kontaktstelle des Vereins (siehe Impressum).',
  },
  {
    key: 'gemini',
    name: 'Google Gemini API (Dokumentenauswertung)',
    legalEntity: 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, IE',
    role: 'processor',
    category: 'saasService',
    country: 'IE',
    transferMechanism: 'adequacyDecision',
    purposes: [
      'Automatisches Auslesen von Belegen und Rechnungen (OCR)',
      'Beantwortung von Fragen zu Vereinsdokumenten',
    ],
    dataClasses: ['identity', 'financial', 'content'],
    retentionText: 'Anfragen und Antworten werden vom Anbieter nicht zur Produktverbesserung genutzt (kostenpflichtige Nutzung)',
    securityMeasures: [
      'Verschlüsselte Übertragung',
      'API-Schlüssel serverseitig im Secret Manager, nie im Client',
      'Nutzung ausschliesslich im kostenpflichtigen Tarif — nur dieser ist vom Auftragsverarbeitungsvertrag gedeckt',
    ],
    // Wichtig: Wir rufen die Gemini *Developer* API auf, nicht Vertex AI. Massgebend ist
    // deshalb der "DPA for Products Where Google is a Data Processor", nicht der Google
    // Cloud DPA. Er deckt nur den kostenpflichtigen Tarif.
    dpaUrl: 'https://business.safety.google/processorterms/',
    privacyUrl: 'https://policies.google.com/privacy',
    contact: 'legal-notices@google.com',
    enabledWhen: byIntegration('gemini'),
    cloudFunctions: ['ocr/*', 'rag/*'],
    memberNoticeDe:
      'Belege und Dokumente, die du hochgeladen hast, wurden zur automatischen Auswertung an den Dienst übermittelt. Der Anbieter verwendet sie vertraglich nicht zur Produktverbesserung.',
  },
  {
    key: 'regasoft',
    name: 'Regasoft / Swiss Rowing (Verbandsportal)',
    // Eine "Regasoft AG" gibt es nicht: Regasoft ist das Regatta- und Meldeportal des
    // Verbands, betrieben unter regasoft.swissrowing.ch. Vertragspartner ist deshalb der
    // Verband selbst — 2026-08-01 verifiziert.
    legalEntity: 'Schweizerischer Ruderverband (SWISS ROWING), Brünigstrasse 182a, 6060 Sarnen, CH',
    role: 'jointController',
    category: 'externalParty',
    country: 'CH',
    transferMechanism: 'domestic',
    purposes: [
      'Meldung von Mitgliedern für Regatten und Lizenzen',
      'Führung der Verbandsmitgliedschaft',
    ],
    dataClasses: ['identity', 'contact', 'membership'],
    retentionText: 'Gemäss Aufbewahrungspraxis des Verbands',
    securityMeasures: ['Verschlüsselte Übertragung', 'API-Schlüssel serverseitig im Secret Manager'],
    // Der Verband veröffentlicht keinen Auftragsverarbeitungsvertrag. Bewusst leer —
    // Prüfung 5 meldet die Lücke, damit sie schriftlich eingefordert wird.
    dpaUrl: '',
    privacyUrl: 'https://www.swissrowing.ch/de/datenschutz',
    contact: 'info@swissrowing.ch',
    enabledWhen: byIntegration('regasoft'),
    cloudFunctions: ['srv/contact.ts'],
    memberNoticeDe:
      'Über die Datenschutz-Kontaktstelle des Vereins (siehe Impressum) — wir leiten deine Anfrage an den Verband weiter. Deine Verbandsmitgliedschaft und Lizenzen werden dort eigenständig geführt.',
  },
  {
    key: 'searchch',
    name: 'search.ch (Adresssuche)',
    legalEntity: 'Swisscom Directories AG, Förrlibuckstrasse 62, 8005 Zürich, CH',
    role: 'processor',
    category: 'saasService',
    country: 'CH',
    transferMechanism: 'domestic',
    purposes: ['Nachschlagen von Adressen zu Name und Ort beim Erfassen neuer Personen'],
    // Übermittelt wird die Suchanfrage (Name + Ort), nicht der Datensatz.
    dataClasses: ['identity', 'contact'],
    retentionText: 'Suchanfragen gemäss Protokollierung des Anbieters',
    securityMeasures: [
      'Verschlüsselte Übertragung',
      'API-Schlüssel serverseitig in app-secrets, nie im Client',
      'Antworten werden serverseitig max. 1 Stunde zwischengespeichert (apiCache, nur Admin-SDK, automatische Löschung per TTL); der Suchbegriff selbst nur als Hash',
    ],
    // search.ch veröffentlicht keinen Auftragsverarbeitungsvertrag. Bewusst leer.
    dpaUrl: '',
    privacyUrl: 'https://search.ch/privacy.de.html',
    contact: 'dataprivacy@localsearch.ch',
    // Diese Integration hat als einzige bereits ein echtes Flag (personLookupEnabled);
    // die Vorhersage ehrt es, damit bestehende Mandanten nicht neu konfiguriert werden
    // müssen.
    enabledWhen: (config) =>
      config?.integrations?.['searchch'] === true || config?.personLookupEnabled === true,
    cloudFunctions: ['_gateway/adapters/searchch.ts', 'searchch/parse.ts'],
    memberNoticeDe:
      'Beim Erfassen deiner Adresse wurde eine Suchanfrage mit deinem Namen und Ort an das Verzeichnis gesendet. Übermittelt wurde nur die Anfrage, nicht dein Datensatz.',
  },
] as const;

/**
 * Every catalogue key that is gated by `AppConfig.integrations`. Audit check 6 compares
 * the tenant's enabled keys against this set: a key switched on that is not here has no
 * register entry, which is register drift and an error finding.
 *
 * Always-on entries are deliberately excluded — they need no flag.
 */
export const INTEGRATION_KEYS: readonly string[] = PROCESSOR_CATALOGUE
  .filter((p) => !p.alwaysOn)
  .map((p) => p.key);

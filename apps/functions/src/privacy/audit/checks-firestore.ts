import { CHANNEL_PRIVACY_INPUTS, CHANNEL_SENSITIVITY_FLOOR } from '@okr/shared-models';
import { SUBJECT_DATA_MAP } from '../subject-data-map';
import { NON_PERSONAL_COLLECTIONS } from './allowlist';
import type { AuditCheck, AuditDoc, Finding } from './types';
import { toFinding } from './types';

/**
 * Audit checks that read Firestore (spec 1.19 Phase 5D): 1–4, 9 and 11.
 *
 * Each check is exported individually so tests can import it by name, and every one is
 * also in `FIRESTORE_CHECKS` so the callable can iterate without knowing them.
 *
 * **None of these writes.** A check reports; a human fixes.
 */

const isArchived = (doc: AuditDoc): boolean => doc.data['isArchived'] === true;

/** Active = not archived. Mirrors the projection's own filter (spec 1.19 §A4). */
const active = (docs: readonly AuditDoc[]): AuditDoc[] => docs.filter((d) => !isArchived(d));

/**
 * Fields that Phase 4 stripped from `persons`/`orgs` and moved into the addresses vault.
 * Their reappearance means a write path bypassed the vault — the single most serious
 * regression this audit can catch, because every per-field privacy gate downstream is
 * presentation-only once the value is back on the parent document.
 */
const FORBIDDEN_PARENT_KEYS = ['ssnId', 'dateOfBirth', 'dateOfDeath', 'favEmail', 'favPhone'] as const;

/** The `usage*` preferences a person is expected to carry (person.model.ts). */
const USAGE_FIELDS = [
  'usageImages', 'usageDateOfBirth', 'usagePostalAddress', 'usageEmail', 'usagePhone', 'usageName',
] as const;

/**
 * Field names that link a document to a data subject. Kept broad on purpose: a false
 * positive costs an admin one look, a false negative means a collection full of personal
 * data is invisible to every export and erasure this system performs.
 */
const SUBJECT_LINK_FIELDS = [
  'personKey', 'memberKey', 'ownerKey', 'subjectKey', 'objectKey', 'authorKey',
  'parentKey', 'userKey', 'userId', 'createdBy', 'approvedBy',
] as const;

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

export const check1: AuditCheck = {
  id: 1,
  severity: 'error',
  titleDe: 'Sensible Felder auf Personen- oder Organisationsdokumenten',
  run: async (ctx) => {
    const offenders: string[] = [];
    for (const collection of ['persons', 'orgs']) {
      for (const doc of await ctx.load(collection)) {
        if (FORBIDDEN_PARENT_KEYS.some((key) => hasValue(doc.data[key]))) {
          offenders.push(doc.okey);
        }
      }
    }
    return toFinding(check1,
      'Diese Dokumente tragen wieder Felder, die in Phase 4 in den Adress-Tresor ausgelagert '
      + `wurden (${FORBIDDEN_PARENT_KEYS.join(', ')}). Solange der Wert auf dem Personendokument `
      + 'liegt, ist jede nachgelagerte Sichtbarkeitsprüfung wirkungslos. Der schreibende Pfad muss '
      + 'korrigiert und die Felder müssen entfernt werden.',
      '/person/all', offenders);
  },
};

/**
 * Channels whose visibility is deliberately wide open, so their absence from
 * `CHANNEL_SENSITIVITY_FLOOR` is a decision rather than an oversight. Listed explicitly:
 * the point of check 2 is that an unclassified channel silently gets the `public` floor,
 * and "we meant that" has to be written down somewhere to be distinguishable from
 * "nobody looked".
 */
const INTENTIONALLY_PUBLIC_CHANNELS: readonly string[] = ['web'];

/**
 * A channel is classified if either privacy map knows it — `CHANNEL_SENSITIVITY_FLOOR`
 * gives it an intrinsic floor, `CHANNEL_PRIVACY_INPUTS` wires it to a usage flag and a
 * tenant floor. Comparing against the floor map alone would flag every ordinary e-mail
 * address, which are absent from it by design.
 */
const isClassifiedChannel = (channel: string): boolean =>
  channel in CHANNEL_SENSITIVITY_FLOOR
  || channel in CHANNEL_PRIVACY_INPUTS
  || INTENTIONALLY_PUBLIC_CHANNELS.includes(channel);

export const check2: AuditCheck = {
  id: 2,
  severity: 'error',
  titleDe: 'Adresskanäle ohne Sensitivitätsstufe',
  run: async (ctx) => {
    const offenders: string[] = [];
    const unknownChannels = new Set<string>();
    for (const doc of await ctx.load('addresses')) {
      const channel = String(doc.data['addressChannel'] ?? '');
      // An empty channel is a different defect; this check is about unclassified ones.
      if (channel !== '' && !isClassifiedChannel(channel)) {
        offenders.push(doc.okey);
        unknownChannels.add(channel);
      }
    }
    return toFinding(check2,
      `Unbekannte Kanäle: ${[...unknownChannels].sort().join(', ')}. Kanäle ohne Eintrag in `
      + 'CHANNEL_SENSITIVITY_FLOOR erhalten die Stufe "public" — der Kanal ist damit ungeschützt, '
      + 'bis er in libs/shared/models/src/lib/privacy.model.ts eingestuft wird.',
      '/security/register', offenders);
  },
};

export const check3: AuditCheck = {
  id: 3,
  severity: 'warning',
  titleDe: 'Veraltete Adress-Projektion (address-directory)',
  run: async (ctx) => {
    const [addresses, directory] = await Promise.all([
      ctx.load('addresses'), ctx.load('address-directory'),
    ]);

    // Newest active address write per parent.
    const newestAddress = new Map<string, number>();
    for (const doc of active(addresses)) {
      const parentKey = String(doc.data['parentKey'] ?? '');
      if (parentKey === '' || doc.updatedAt === undefined) continue;
      newestAddress.set(parentKey, Math.max(newestAddress.get(parentKey) ?? 0, doc.updatedAt));
    }

    const projections = new Map(directory.map((d) => [String(d.data['parentKey'] ?? ''), d]));
    const offenders: string[] = [];
    for (const [parentKey, addressTime] of newestAddress) {
      const projection = projections.get(parentKey);
      if (!projection) {
        // No projection at all, though the parent has active addresses: the member is
        // simply missing from the directory.
        offenders.push(parentKey);
      } else if (projection.updatedAt !== undefined && projection.updatedAt < addressTime) {
        offenders.push(projection.okey);
      }
    }
    return toFinding(check3,
      'Die Projektion ist älter als die Adressen, die sie abbilden soll — oder fehlt ganz. '
      + 'Betroffene Mitglieder erscheinen im Verzeichnis mit veralteten oder gar keinen '
      + 'Kontaktdaten. Mit der Funktion rebuildAddressDirectory neu aufbauen.',
      '/person/all', offenders);
  },
};

export const check4: AuditCheck = {
  id: 4,
  severity: 'error',
  titleDe: 'Mehr als eine Favoritenadresse pro Kanal',
  run: async (ctx) => {
    const counts = new Map<string, number>();
    for (const doc of active(await ctx.load('addresses'))) {
      if (doc.data['isFavorite'] !== true) continue;
      const key = `${doc.data['parentKey'] ?? ''}|${doc.data['addressChannel'] ?? ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // The key is `parentKey|channel` — a document id and an enum, never a value.
    const offenders = [...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key);
    return toFinding(check4,
      'Für dieselbe Person und denselben Kanal sind mehrere Adressen als Favorit markiert. '
      + 'Welche davon angezeigt und in die Projektion übernommen wird, ist dann zufällig — '
      + 'eine als privat markierte Adresse kann so öffentlich werden. Pro Kanal genau einen '
      + 'Favoriten setzen.',
      '/person/all', offenders);
  },
};

export const check9: AuditCheck = {
  id: 9,
  severity: 'info',
  titleDe: 'Personen ohne eigene Datenschutz-Einstellungen',
  run: async (ctx) => {
    // `usage*` values are numeric enums where 0 (Public) is a deliberate choice — a
    // truthiness test here would report every member who chose Public.
    const offenders = (await ctx.load('persons'))
      .filter((doc) => USAGE_FIELDS.some((field) => doc.data[field] === undefined))
      .map((doc) => doc.okey);
    return toFinding(check9,
      'Diese Personendokumente stammen aus der Zeit vor den Datenschutz-Einstellungen und '
      + 'verlassen sich auf den impliziten Standard "Restricted". Das ist zulässig, aber es ist '
      + 'keine Entscheidung der betroffenen Person. Beim nächsten Kontakt nachführen.',
      '/person/all', offenders);
  },
};

export const check11: AuditCheck = {
  id: 11,
  severity: 'error',
  titleDe: 'Sammlungen mit Personenbezug ohne Eintrag in der Subject-Data-Map',
  run: async (ctx) => {
    const mapped = new Set(SUBJECT_DATA_MAP.map((entry) => entry.collection));
    const offenders: string[] = [];

    for (const collection of await ctx.listCollections()) {
      if (mapped.has(collection) || NON_PERSONAL_COLLECTIONS.has(collection)) continue;
      const docs = await ctx.load(collection);
      const linked = docs.some((doc) => SUBJECT_LINK_FIELDS.some((f) => hasValue(doc.data[f])));
      if (linked) offenders.push(collection);
    }
    return toFinding(check11,
      'Diese Sammlungen enthalten einen Personenbezug, sind aber in der Subject-Data-Map nicht '
      + 'erfasst. Ihre Daten fehlen damit in jeder Datenauskunft und werden bei einer Löschung '
      + 'nicht berücksichtigt. Für jede Sammlung eine Zeile in subject-data-map.ts ergänzen — '
      + 'oder sie ausdrücklich als "not personal data" kennzeichnen.',
      '/security/privacy-audit', offenders);
  },
};

export const FIRESTORE_CHECKS: readonly AuditCheck[] = [check1, check2, check3, check4, check9, check11];

export type { Finding };

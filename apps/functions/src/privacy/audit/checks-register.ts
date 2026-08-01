import { INTEGRATION_KEYS, activeProcessors } from '@okr/security-processing-util';
import type { ProcessorEntry } from '@okr/shared-models';
import { SUBJECT_DATA_MAP } from '../subject-data-map';
import type { AuditCheck } from './types';
import { toFinding } from './types';

/**
 * Audit checks that read the register, the subject-data map and the policy state
 * (spec 1.19 Phase 5D): 5, 6, 7, 8 and 10.
 */

/** Days in a month, for the retention arithmetic. Deliberately coarse. */
const MS_PER_MONTH = 30.44 * 24 * 3600 * 1000;

/** A register row is complete when an auditor can answer every question from it. */
function missingFields(entry: ProcessorEntry): string[] {
  const missing: string[] = [];
  if (!entry.dpaUrl) missing.push('dpaUrl');
  if (!entry.retentionText) missing.push('retentionText');
  if (!entry.transferMechanism || entry.transferMechanism === 'none') missing.push('transferMechanism');
  if (!entry.purposes || entry.purposes.length === 0) missing.push('purposes');
  if (!entry.legalEntity) missing.push('legalEntity');
  return missing;
}

export const check5: AuditCheck = {
  id: 5,
  severity: 'error',
  titleDe: 'Unvollständige Einträge im Bearbeitungsverzeichnis',
  run: async (ctx) => {
    // Only ACTIVE entries: an incomplete row for an integration this tenant never
    // switched on is not this tenant's problem to fix.
    const offenders = activeProcessors(ctx.config)
      .filter((entry) => missingFields(entry).length > 0)
      .map((entry) => entry.key);
    return toFinding(check5,
      'Diesen aktiven Empfängern fehlt mindestens eine Pflichtangabe (Auftragsverarbeitungs'
      + 'vertrag, Aufbewahrung, Übermittlungsgrundlage, Zweck oder Rechtsträger). Fehlt der '
      + 'Vertrag, ist er beim Anbieter schriftlich einzufordern; die übrigen Angaben werden im '
      + 'Katalog beziehungsweise in der Mandantenkonfiguration ergänzt.',
      '/security/register', offenders);
  },
};

export const check6: AuditCheck = {
  id: 6,
  severity: 'error',
  titleDe: 'Aktivierte Integration ohne Katalogeintrag',
  run: async (ctx) => {
    const known = new Set(INTEGRATION_KEYS);
    // This check is what replaces the dropped repo scanner (D-P5-5): switching an
    // integration on without adding its catalogue entry fails here instead of quietly
    // creating an undocumented transfer.
    const offenders = Object.entries(ctx.config?.integrations ?? {})
      .filter(([key, enabled]) => enabled === true && !known.has(key))
      .map(([key]) => key);
    return toFinding(check6,
      'Diese Integrationen sind in der Mandantenkonfiguration aktiviert, haben aber keinen '
      + 'Eintrag im Verarbeitungskatalog. Es werden also Daten an einen Empfänger übermittelt, '
      + 'der im Bearbeitungsverzeichnis nicht erscheint. Eintrag in PROCESSOR_CATALOGUE ergänzen '
      + 'oder die Integration deaktivieren.',
      '/security/register', offenders);
  },
};

export const check7: AuditCheck = {
  id: 7,
  severity: 'warning',
  titleDe: 'Datensätze über die deklarierte Aufbewahrungsfrist hinaus',
  run: async (ctx) => {
    const now = Date.now();
    const offenders: string[] = [];

    for (const entry of SUBJECT_DATA_MAP) {
      const months = entry.retention?.months;
      // 'indefinite' rows are kept on purpose (contract, club record) — never a finding.
      if (typeof months !== 'number') continue;

      const cutoff = now - months * MS_PER_MONTH;
      for (const doc of await ctx.load(entry.collection)) {
        // No timestamp means the age is unknown. Reporting it would be a guess, and this
        // finding is what an admin acts on.
        if (doc.updatedAt !== undefined && doc.updatedAt < cutoff) {
          offenders.push(`${entry.collection}/${doc.okey}`);
        }
      }
    }
    return toFinding(check7,
      'Diese Datensätze sind älter als die für ihre Sammlung deklarierte Aufbewahrungsfrist. '
      + 'Eine automatische Löschung findet bewusst nicht statt (D-P5-4) — die Bereinigung ist '
      + 'ein bewusster Entscheid und erfolgt von Hand.',
      '/security/privacy-audit', offenders);
  },
};

export const check8: AuditCheck = {
  id: 8,
  severity: 'warning',
  titleDe: 'Mitglieder mit veralteter Zustimmung zur Datenschutzerklärung',
  run: async (ctx) => {
    const current = ctx.config?.privacyPolicyVersion ?? '';
    // No declared version means the tenant publishes no policy; the acceptance prompt
    // stays silent by design, so demanding acceptance here would be incoherent.
    if (current === '') return undefined;

    const offenders = (await ctx.load('users'))
      .filter((doc) => String(doc.data['policyAcceptedVersion'] ?? '') !== current)
      .map((doc) => doc.okey);
    return toFinding(check8,
      `Diese Mitglieder haben die aktuelle Fassung (${current}) der Datenschutzerklärung noch `
      + 'nicht bestätigt. Die Zustimmung wird beim nächsten Anmelden abgefragt; hier steht, '
      + 'wie viele noch ausstehen.',
      '/security/privacy-audit', offenders);
  },
};

export const check10: AuditCheck = {
  id: 10,
  severity: 'info',
  titleDe: 'Bekannte Lücke: Profilbilder werden nicht durchgesetzt',
  // A constant reminder with no query. It exists so a gap that is understood and accepted
  // stays visible: an unenforced control that nobody is reminded of becomes an unenforced
  // control that everyone believes is enforced.
  run: async () => toFinding(check10,
    'Die Einstellung usageImages und die Avatare werden derzeit nicht technisch durchgesetzt: '
    + 'ein Profilbild ist über seine URL erreichbar, unabhängig von der gewählten Sichtbarkeit. '
    + 'Das ist bekannt und beabsichtigt dokumentiert — es ist keine neue Feststellung, sondern '
    + 'eine offene Aufgabe.',
    '/security/privacy-audit', ['usageImages']),
};

export const REGISTER_CHECKS: readonly AuditCheck[] = [check5, check6, check7, check8, check10];

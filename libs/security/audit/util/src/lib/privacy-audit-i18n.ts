import { Signal } from '@angular/core';

/**
 * Mirrors the lib path (`libs/security/audit/util/src/i18n` →
 * `assets/i18n/security/audit/util`). The `util` segment is part of the scope — see the
 * note in `processing-i18n.ts`.
 */
const PFX = '@security/audit/util.';

/**
 * Chrome only. The check titles and explanations come from the server as `titleDe` /
 * `detailDe` and are rendered verbatim — the wording lives next to the rule that produces
 * it, which is the only place it cannot drift from what the check actually tests.
 */
export const PRIVACY_AUDIT_I18N_KEYS = {
  title: PFX + 'title',
  subtitle: PFX + 'subtitle',
  run: PFX + 'run',
  running: PFX + 'running',
  export: PFX + 'export',
  clean: PFX + 'clean',
  notRun: PFX + 'notRun',
  failed: PFX + 'failed',
  ranAt: PFX + 'ranAt',
  checksRun: PFX + 'checksRun',
  affected: PFX + 'affected',
  samples: PFX + 'samples',
  goToFix: PFX + 'goToFix',
  rebuild_action: PFX + 'rebuild.action',
  rebuild_running: PFX + 'rebuild.running',
  rebuild_confirm: PFX + 'rebuild.confirm',
  rebuild_done: PFX + 'rebuild.done',
  rebuild_cross: PFX + 'rebuild.cross',
  drive_action: PFX + 'drive.action',
  drive_running: PFX + 'drive.running',
  drive_ok: PFX + 'drive.ok',
  drive_failed: PFX + 'drive.failed',
  severity_error: PFX + 'severity.error',
  severity_warning: PFX + 'severity.warning',
  severity_info: PFX + 'severity.info',
} satisfies Record<string, string>;

export type PrivacyAuditI18n = { [K in keyof typeof PRIVACY_AUDIT_I18N_KEYS]: Signal<string> };

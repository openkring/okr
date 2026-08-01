import type { PrivacyAuditResult, PrivacyFinding } from '@okr/shared-models';
import { escapeHtml } from '@okr/security-processing-util';

/**
 * The printable audit report, handed to the same `generateDocument` HTML→PDF Cloud
 * Function as the register (no second PDF mechanism).
 *
 * Pure, so it is unit-tested. Everything is escaped: `titleDe`/`detailDe` are authored
 * in-repo, but `sampleKeys` come from live document ids, and puppeteer executes what it
 * is given.
 */

export interface AuditDocumentOptions {
  readonly tenantName: string;
  /** Already formatted by the caller. */
  readonly generatedOn: string;
  /** Rendered when there is nothing to report. */
  readonly cleanMessage: string;
}

const SEVERITY_LABEL: Record<PrivacyFinding['severity'], string> = {
  error: 'Fehler',
  warning: 'Warnung',
  info: 'Hinweis',
};

function findingBlock(finding: PrivacyFinding): string {
  const samples = finding.sampleKeys.length === 0
    ? ''
    : `<div class="samples"><strong>Beispiele</strong> (${finding.sampleKeys.length} von ${finding.count}):
        <code>${finding.sampleKeys.map(escapeHtml).join('</code>, <code>')}</code></div>`;

  return `<section class="finding ${escapeHtml(finding.severity)}">
    <h3><span class="badge">${SEVERITY_LABEL[finding.severity]}</span>
      Prüfung ${finding.checkId} — ${escapeHtml(finding.titleDe)}</h3>
    <div class="count">Betroffen: ${finding.count}</div>
    <p>${escapeHtml(finding.detailDe)}</p>
    ${samples}
  </section>`;
}

export function buildAuditDocument(result: PrivacyAuditResult, options: AuditDocumentOptions): string {
  const counts = {
    error: result.findings.filter((f) => f.severity === 'error').length,
    warning: result.findings.filter((f) => f.severity === 'warning').length,
    info: result.findings.filter((f) => f.severity === 'info').length,
  };

  const body = result.findings.length === 0
    ? `<p class="clean">${escapeHtml(options.cleanMessage)}</p>`
    : result.findings.map(findingBlock).join('');

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<title>Datenschutz-Prüfbericht — ${escapeHtml(options.tenantName)}</title>
<style>
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  h3 { font-size: 12px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 10px; margin-bottom: 12px; }
  .summary { background: #f4f6f8; padding: 8px 10px; margin-bottom: 14px; }
  .finding { border-left: 4px solid #ccc; padding: 8px 10px; margin: 10px 0; page-break-inside: avoid; background: #fafbfc; }
  .finding.error { border-left-color: #cf3c4f; }
  .finding.warning { border-left-color: #e0ac08; }
  .finding.info { border-left-color: #3880ff; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; background: #e6e9ec; font-size: 10px; margin-right: 6px; }
  .count { color: #666; font-size: 10px; margin-bottom: 4px; }
  .samples { font-size: 10px; color: #444; margin-top: 4px; }
  code { background: #eef1f4; padding: 1px 3px; border-radius: 2px; }
  .clean { color: #28ba62; font-weight: 600; }
</style></head>
<body>
  <h1>Datenschutz-Prüfbericht</h1>
  <div class="meta">${escapeHtml(options.tenantName)} · Stand ${escapeHtml(options.generatedOn)} ·
    ${result.checksRun} Prüfungen ausgeführt</div>
  <div class="summary">
    <strong>${counts.error}</strong> Fehler ·
    <strong>${counts.warning}</strong> Warnungen ·
    <strong>${counts.info}</strong> Hinweise
  </div>
  ${body}
</body></html>`;
}

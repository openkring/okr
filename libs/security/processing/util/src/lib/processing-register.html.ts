import type { ProcessorEntry } from '@okr/shared-models';

/**
 * The printable Bearbeitungsverzeichnis — a self-contained HTML document handed to the
 * existing `generateDocument` Cloud Function (puppeteer HTML→PDF). This is the artifact an
 * auditor asks for: the summary table plus one full block per processor.
 *
 * Pure and framework-free so it can be unit-tested; no second PDF mechanism is introduced.
 *
 * Every value is HTML-escaped. The catalogue is authored in-repo, but
 * `AppConfig.additionalProcessors` is typed by a tenant admin — unescaped it would be
 * stored XSS rendered into a document, and puppeteer executes what it is given.
 */

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RegisterDocumentOptions {
  readonly tenantName: string;
  /** Rendered date, already formatted by the caller (no date helpers in a pure module). */
  readonly generatedOn: string;
  /** The controller sentence — legal wording, passed in from i18n. */
  readonly controllerNote: string;
  /** Inline `<svg>` of the processing map, or `''` to omit the diagram. */
  readonly diagramSvg?: string;
}

const list = (values: readonly string[]): string =>
  values.length === 0
    ? '<span class="empty">—</span>'
    : `<ul>${values.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`;

const link = (url: string): string =>
  url === ''
    ? '<span class="missing">nicht hinterlegt</span>'
    : `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;

function summaryRow(entry: ProcessorEntry): string {
  return `<tr>
    <td>${escapeHtml(entry.name)}</td>
    <td>${escapeHtml(entry.role)}</td>
    <td>${escapeHtml(entry.country)}</td>
    <td>${escapeHtml(entry.transferMechanism)}</td>
    <td>${escapeHtml(entry.dataClasses.join(', '))}</td>
  </tr>`;
}

function detailBlock(entry: ProcessorEntry): string {
  return `<section class="entry">
    <h3>${escapeHtml(entry.name)}</h3>
    <table class="fields">
      <tr><th>Rechtsträger</th><td>${escapeHtml(entry.legalEntity)}</td></tr>
      <tr><th>Rolle</th><td>${escapeHtml(entry.role)}</td></tr>
      <tr><th>Kategorie</th><td>${escapeHtml(entry.category)}</td></tr>
      <tr><th>Land</th><td>${escapeHtml(entry.country)}</td></tr>
      <tr><th>Übermittlungsgrundlage</th><td>${escapeHtml(entry.transferMechanism)}</td></tr>
      <tr><th>Zwecke</th><td>${list(entry.purposes)}</td></tr>
      <tr><th>Datenkategorien</th><td>${escapeHtml(entry.dataClasses.join(', '))}</td></tr>
      <tr><th>Aufbewahrung</th><td>${escapeHtml(entry.retentionText)}</td></tr>
      <tr><th>Sicherheitsmassnahmen</th><td>${list(entry.securityMeasures)}</td></tr>
      <tr><th>Auftragsverarbeitungsvertrag</th><td>${link(entry.dpaUrl)}</td></tr>
      <tr><th>Datenschutzerklärung</th><td>${link(entry.privacyUrl)}</td></tr>
      <tr><th>Kontakt</th><td>${escapeHtml(entry.contact)}</td></tr>
    </table>
  </section>`;
}

export function buildRegisterDocument(
  entries: readonly ProcessorEntry[],
  options: RegisterDocumentOptions,
): string {
  const summary = entries.length === 0
    ? '<p class="empty">Keine aktiven Empfänger.</p>'
    : `<table class="summary">
        <thead><tr>
          <th>Name</th><th>Rolle</th><th>Land</th><th>Grundlage</th><th>Datenkategorien</th>
        </tr></thead>
        <tbody>${entries.map(summaryRow).join('')}</tbody>
      </table>`;

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<title>Bearbeitungsverzeichnis — ${escapeHtml(options.tenantName)}</title>
<style>
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  h2 { font-size: 14px; margin-top: 22px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  h3 { font-size: 12px; margin: 0 0 6px; }
  .meta { color: #666; font-size: 10px; margin-bottom: 14px; }
  .controller { background: #f4f6f8; border-left: 3px solid #3880ff; padding: 8px 10px; margin: 12px 0; }
  table { border-collapse: collapse; width: 100%; }
  .summary th, .summary td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  .summary th { background: #f4f6f8; }
  .entry { page-break-inside: avoid; margin-top: 14px; border: 1px solid #ddd; padding: 8px 10px; }
  .fields th { text-align: left; width: 190px; vertical-align: top; padding: 3px 6px 3px 0; font-weight: 600; }
  .fields td { padding: 3px 0; vertical-align: top; }
  ul { margin: 0; padding-left: 16px; }
  .missing { color: #cf3c4f; font-weight: 600; }
  .empty { color: #888; }
  .diagram { margin: 12px 0; page-break-inside: avoid; }
</style></head>
<body>
  <h1>Bearbeitungsverzeichnis</h1>
  <div class="meta">${escapeHtml(options.tenantName)} · Stand ${escapeHtml(options.generatedOn)}</div>
  <div class="controller">${escapeHtml(options.controllerNote)}</div>
  <h2>Übersicht</h2>
  ${summary}
  ${options.diagramSvg ? `<h2>Datenflüsse</h2><div class="diagram">${options.diagramSvg}</div>` : ''}
  <h2>Einträge im Detail</h2>
  ${entries.map(detailBlock).join('')}
</body></html>`;
}

import type { LogInfo } from '@okr/shared-models';

/** What the report modal presents: a read-only report, a check with repairs, an operation or a migration. */
export type ReportKind = 'report' | 'check' | 'operation' | 'migration';

export interface ReportAction {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
}

export interface ReportFinding {
  id: string;
  title: string;
  detail?: string;
  /** a tap on the finding closes the modal and navigates here */
  url?: string;
  actions?: ReportAction[];
  /** an editable chip list (e.g. a user's roles); the modal hands every change to `onChipsChange` */
  chips?: ReportChips;
}

/** Chips shown under a finding: `value` and `all` are comma-separated, as `okr-chips` takes them. */
export interface ReportChips {
  name: 'tag' | 'role';
  value: string;
  all: string;
}

export type ReportResult =
  | { kind: 'action'; findingId: string; actionId: string }
  | { kind: 'apply' }
  | undefined;

/**
 * Maps a LogInfo log to report findings. `MESSAGE_ONLY` entries and entries without a name
 * are dropped; `urlOf` optionally supplies the route a finding points at.
 */
export function logToFindings(log: LogInfo[], urlOf?: (id: string) => string | undefined): ReportFinding[] {
  return log
    .filter(entry => entry.id !== 'MESSAGE_ONLY' && entry.name.length > 0)
    .map(entry => ({ id: entry.id, title: entry.name, detail: entry.message, url: urlOf?.(entry.id) }));
}

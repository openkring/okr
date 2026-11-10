import type { SendingModel, SendingState } from '@okr/shared-models';

/** What an admin sees of a letter: the seven server states folded into five (spec 1.150 §9). */
export type SendingStatus = 'inProduction' | 'sent' | 'delivered' | 'problem' | 'undeliverable';

export const SENDING_STATUSES: SendingStatus[] = ['inProduction', 'sent', 'delivered', 'problem', 'undeliverable'];

/** queued, submitting and submitted all mean «with the printer»; the rest map one to one. */
export function sendingStatusOf(state: SendingState): SendingStatus {
  switch (state) {
    case 'sent': return 'sent';
    case 'delivered': return 'delivered';
    case 'failed': return 'problem';
    case 'undeliverable': return 'undeliverable';
    default: return 'inProduction';
  }
}

/** The i18n key name (`SENDING_I18N_KEYS`) of a status label. */
export function sendingStatusLabelKey(status: SendingStatus): 'status_in_production' | 'status_sent' | 'status_delivered' | 'status_problem' | 'status_undeliverable' {
  switch (status) {
    case 'sent': return 'status_sent';
    case 'delivered': return 'status_delivered';
    case 'problem': return 'status_problem';
    case 'undeliverable': return 'status_undeliverable';
    default: return 'status_in_production';
  }
}

export function sendingStatusColor(status: SendingStatus): string {
  switch (status) {
    case 'delivered': return 'success';
    case 'sent': return 'primary';
    case 'problem': return 'danger';
    case 'undeliverable': return 'warning';
    default: return 'medium';
  }
}

/** A letter that went wrong has a task for the admins (spec 1.150 §9). */
export function sendingHasTask(state: SendingState): boolean {
  return state === 'failed' || state === 'undeliverable';
}

export interface SendingSummary {
  total: number;
  inProduction: number;
  sent: number;
  delivered: number;
  problem: number;
  undeliverable: number;
}

export function summarizeSendings(records: Pick<SendingModel, 'state'>[]): SendingSummary {
  const summary: SendingSummary = { total: records.length, inProduction: 0, sent: 0, delivered: 0, problem: 0, undeliverable: 0 };
  for (const r of records) summary[sendingStatusOf(r.state)]++;
  return summary;
}

/** The non-zero parts of a summary, in display order: «38 versandt», «2 in Produktion». */
export function summaryParts(summary: SendingSummary): { status: SendingStatus; count: number }[] {
  return SENDING_STATUSES.map((status) => ({ status, count: summary[status] })).filter((p) => p.count > 0);
}

/** Newest first by `createdAt` (ISO strings sort); returns a new array. */
export function sortSendingsNewestFirst<T extends Pick<SendingModel, 'createdAt'>>(records: T[]): T[] {
  return [...records].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export type SendingPeriod = 'all' | 'days30' | 'days90' | 'year';
export const SENDING_PERIODS: SendingPeriod[] = ['all', 'days30', 'days90', 'year'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO lower bound of a period, '' for `all`. */
export function sendingPeriodStart(period: SendingPeriod, now: Date): string {
  switch (period) {
    case 'days30': return new Date(now.getTime() - 30 * DAY_MS).toISOString();
    case 'days90': return new Date(now.getTime() - 90 * DAY_MS).toISOString();
    case 'year': return new Date(now.getTime() - 365 * DAY_MS).toISOString();
    default: return '';
  }
}

export function filterSendings<T extends Pick<SendingModel, 'state' | 'createdAt'>>(
  records: T[], status: SendingStatus | 'all', period: SendingPeriod, now: Date,
): T[] {
  const from = sendingPeriodStart(period, now);
  return records.filter((r) => (status === 'all' || sendingStatusOf(r.state) === status) && (!from || (r.createdAt ?? '') >= from));
}

/** The ISO time of the last history entry (falls back to `updatedAt`, then `createdAt`); '' when none. */
export function lastSendingAt(r: Pick<SendingModel, 'history' | 'updatedAt' | 'createdAt'>): string {
  const last = r.history?.length ? r.history[r.history.length - 1].at : '';
  return last || r.updatedAt || r.createdAt || '';
}

/** 'dd.MM.yyyy' of an ISO timestamp in the viewer's time zone; '' when unreadable. */
export function sendingDateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-CH');
}

/** 'mailing.<okey>' -> '<okey>'; '' for any other source. */
export function mailingKeyOfSource(source: string): string {
  return source.startsWith('mailing.') ? source.slice('mailing.'.length) : '';
}

import { CalEventModel } from '@okr/shared-models';
import { fill, prettyFormatDate, ReportFinding } from '@okr/shared-util-core';

import { auditCalEventSeries, findDuplicateCalEvents } from './calevent-audit.util';

/**
 * Already-translated templates for the duplicate-event report. This util is pure and cannot
 * translate, so the caller resolves the i18n keys and passes the strings in. Placeholders use
 * single braces (see `fill`).
 */
export interface DuplicateEventTexts {
  /** `{count}` events on one slot, `{calendars}` the calendar names, `{series}` the series ids */
  slot: string;
  /** shown in place of `{series}` for an event that belongs to no series */
  single: string;
  /** `{expected}` events the rule describes, `{actual}` events stored */
  countMismatch: string;
  /** `{count}` events with a foreign date in the search index, `{okeys}` their keys */
  staleIndex: string;
}

/**
 * Builds the report findings of the duplicate-event check: events on the same slot and series whose
 * stored documents no longer match their own recurrence rule.
 *
 * A calevent has no detail route (events open in a modal from the list), so no finding carries a `url`.
 */
export function duplicateEventFindings(events: CalEventModel[], texts: DuplicateEventTexts): ReportFinding[] {
  const findings: ReportFinding[] = [];

  for (const dup of findDuplicateCalEvents(events)) {
    findings.push({
      id: dup.events.map(e => e.okey).join('/'),
      title: `${prettyFormatDate(dup.startDate)} ${dup.startTime} ${dup.name}`.replace(/\s+/g, ' ').trim(),
      detail: fill(texts.slot, {
        count: dup.events.length,
        calendars: dup.calendars.length > 0 ? dup.calendars.join(', ') : '—',
        series: dup.seriesIds.map(s => s || texts.single).join(', '),
      }),
      url: undefined,
    });
  }

  for (const issue of auditCalEventSeries(events)) {
    findings.push({
      id: issue.seriesId,
      title: `${issue.name} (${prettyFormatDate(issue.firstDate)} – ${prettyFormatDate(issue.lastDate)})`,
      detail: issue.kind === 'countMismatch'
        ? fill(texts.countMismatch, { expected: issue.expected, actual: issue.actual })
        : fill(texts.staleIndex, { count: issue.okeys.length, okeys: issue.okeys.join(', ') }),
      url: undefined,
    });
  }

  return findings;
}

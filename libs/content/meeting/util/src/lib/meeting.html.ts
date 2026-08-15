import type { AgendaItem, MeetingAttendee, MeetingModel } from '@okr/shared-models';
import { escapeHtml } from '@okr/security-processing-util';

/**
 * The printable minutes, handed to the same `generateDocument` HTML→PDF Cloud Function
 * as the privacy report and the processing register (no second PDF mechanism, and no
 * TemplateModel that every tenant would first have to author — see the note in 3.20).
 *
 * Pure, so it is unit-tested. Everything is escaped: the minutes, decisions and attendee
 * names are user input and puppeteer executes what it is given.
 */

export interface MinutesDocumentLabels {
  readonly title: string;        // 'Protokoll'
  readonly date: string;
  readonly location: string;
  readonly attendees: string;
  readonly present: string;
  readonly excused: string;
  readonly absent: string;
  readonly invited: string;
  readonly agenda: string;
  readonly minutes: string;
  readonly decision: string;
  readonly generated: string;    // 'Erstellt am'
}

export interface MinutesDocumentOptions {
  readonly tenantName: string;
  /** Both already formatted by the caller (ViewDate). */
  readonly meetingDate: string;
  readonly generatedOn: string;
  readonly labels: MinutesDocumentLabels;
}

function attendeeNames(attendees: MeetingAttendee[], state: MeetingAttendee['state']): string[] {
  return attendees
    .filter(a => a.state === state)
    .map(a => `${a.person?.name1 ?? ''} ${a.person?.name2 ?? ''}`.trim())
    .filter(name => name !== '');
}

function attendeeRow(label: string, names: string[]): string {
  if (names.length === 0) return '';
  return `<div class="row"><strong>${escapeHtml(label)}</strong> (${names.length}):
    ${names.map(escapeHtml).join(', ')}</div>`;
}

function agendaBlock(item: AgendaItem, position: number, labels: MinutesDocumentLabels): string {
  const owner = item.owner ? `${item.owner.name1 ?? ''} ${item.owner.name2 ?? ''}`.trim() : '';
  const minutes = (item.minutes ?? '') === ''
    ? ''
    : `<p class="minutes">${escapeHtml(item.minutes)}</p>`;
  const decision = (item.decision ?? '') === ''
    ? ''
    : `<p class="decision"><strong>${escapeHtml(labels.decision)}:</strong> ${escapeHtml(item.decision)}</p>`;

  return `<section class="item">
    <h3>${position}. ${escapeHtml(item.title ?? '')}${owner === '' ? '' : ` <span class="owner">— ${escapeHtml(owner)}</span>`}</h3>
    ${minutes}
    ${decision}
  </section>`;
}

/**
 * Render one meeting as a self-contained HTML document.
 * @param meeting the meeting whose agenda, attendance and minutes are printed
 * @param options tenant name, the two formatted dates and the translated labels
 */
export function buildMinutesDocument(meeting: MeetingModel, options: MinutesDocumentOptions): string {
  const { labels } = options;
  const attendees = meeting.attendees ?? [];
  const agenda = meeting.agenda ?? [];

  const attendance = [
    attendeeRow(labels.present, attendeeNames(attendees, 'present')),
    attendeeRow(labels.excused, attendeeNames(attendees, 'excused')),
    attendeeRow(labels.absent, attendeeNames(attendees, 'absent')),
    attendeeRow(labels.invited, attendeeNames(attendees, 'invited')),
  ].join('');

  const body = agenda.length === 0
    ? ''
    : agenda.map((item, i) => agendaBlock(item, i + 1, labels)).join('');

  const location = (meeting.locationKey ?? '') === ''
    ? ''
    : ` · ${escapeHtml(labels.location)}: ${escapeHtml(meeting.locationKey)}`;

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<title>${escapeHtml(labels.title)} — ${escapeHtml(meeting.name ?? '')}</title>
<style>
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  h2 { font-size: 13px; margin: 16px 0 6px; }
  h3 { font-size: 12px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 10px; margin-bottom: 12px; }
  .attendance { background: #f4f6f8; padding: 8px 10px; margin-bottom: 14px; }
  .row { margin: 2px 0; }
  .item { border-left: 4px solid #3880ff; padding: 8px 10px; margin: 10px 0; page-break-inside: avoid; background: #fafbfc; }
  .owner { color: #666; font-weight: 400; }
  .minutes { margin: 4px 0; white-space: pre-wrap; }
  .decision { margin: 4px 0; background: #eef4ff; padding: 4px 6px; }
  .footer { color: #666; font-size: 10px; margin-top: 16px; }
</style></head>
<body>
  <h1>${escapeHtml(labels.title)} — ${escapeHtml(meeting.name ?? '')}</h1>
  <div class="meta">${escapeHtml(options.tenantName)} · ${escapeHtml(labels.date)}:
    ${escapeHtml(options.meetingDate)} ${escapeHtml(meeting.startTime ?? '')}${location}</div>
  <h2>${escapeHtml(labels.attendees)}</h2>
  <div class="attendance">${attendance}</div>
  <h2>${escapeHtml(labels.agenda)}</h2>
  ${body}
  <div class="footer">${escapeHtml(labels.generated)} ${escapeHtml(options.generatedOn)}</div>
</body></html>`;
}

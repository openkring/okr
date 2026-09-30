// apps/functions/src/calendar/mail.ts
//
// HTML for the calendar notification emails and the answer pages (spec 1.73 §2–§5).
// Pure string builders: every piece of user text goes through escapeHtml, the rest is fixed
// copy. Inline styles only — mail clients drop <style> blocks.

import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

export interface EventSummary {
  appName: string;
  eventName: string;
  when: string;
  location: string;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string | undefined): string {
  return (text ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Escaped, with line breaks kept. */
function paragraphText(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

export function eventWhen(startDate: string | undefined, startTime: string | undefined): string {
  if (!startDate) return '';
  const date = convertDateFormatToString(startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
  return startTime ? `${date}, ${startTime}` : date;
}

/** The readable place of a calevent: the name part of `locationKey` ('name@key'), '' when there is none. */
export function locationLabel(locationKey: string | undefined): string {
  if (!locationKey) return '';
  const at = locationKey.indexOf('@');
  if (at < 0) return '';
  return locationKey.slice(0, at).trim();
}

const BUTTON = 'display:inline-block;padding:10px 18px;margin:4px 8px 4px 0;border-radius:6px;text-decoration:none;font-weight:600;';
const PRIMARY = `${BUTTON}background:#1f6feb;color:#ffffff;`;
const SECONDARY = `${BUTTON}background:#eef1f5;color:#1f2328;`;

function button(href: string, label: string, style: string): string {
  return `<a href="${escapeHtml(href)}" style="${style}">${escapeHtml(label)}</a>`;
}

function eventBlock(p: EventSummary): string {
  const rows = [
    `<strong>${escapeHtml(p.eventName)}</strong>`,
    p.when ? escapeHtml(p.when) : '',
    p.location ? escapeHtml(p.location) : '',
  ].filter(Boolean).join('<br>');
  return `<p style="margin:16px 0;padding:12px 16px;background:#f6f8fa;border-radius:6px;">${rows}</p>`;
}

function layout(appName: string, body: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(appName)}</title></head>`
    + `<body style="margin:0;padding:24px 16px;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328;line-height:1.5;">`
    + `<div style="max-width:560px;margin:0 auto;">`
    + `<p style="margin:0 0 16px;font-size:13px;color:#57606a;">${escapeHtml(appName)}</p>`
    + body
    + `</div></body></html>`;
}

export function invitationEmail(p: EventSummary & { inviterName: string; note: string; eventUrl: string; acceptUrl: string; declineUrl: string }): { subject: string; html: string } {
  const subject = p.when ? `Einladung: ${p.eventName}, ${p.when}` : `Einladung: ${p.eventName}`;
  const note = p.note.trim() ? `<p>${paragraphText(p.note.trim())}</p>` : '';
  const html = layout(p.appName,
    `<p>${escapeHtml(p.inviterName)} lädt dich ein:</p>`
    + eventBlock(p)
    + note
    + `<p>Nimmst du teil?</p>`
    + `<p>${button(p.acceptUrl, 'ich nehme teil', PRIMARY)}${button(p.declineUrl, 'ich nehme nicht teil', SECONDARY)}</p>`
    + `<p style="font-size:13px;color:#57606a;">Du kannst auch in der App antworten: ${button(p.eventUrl, 'Anlass öffnen', SECONDARY)}</p>`);
  return { subject, html };
}

export function commentEmail(p: EventSummary & { authorName: string; comment: string; eventUrl: string }): { subject: string; html: string } {
  const subject = `${p.authorName} hat ${p.eventName} kommentiert`;
  const html = layout(p.appName,
    `<p>${escapeHtml(p.authorName)} hat einen Kommentar geschrieben:</p>`
    + `<p style="margin:16px 0;padding:12px 16px;border-left:3px solid #d0d7de;">${paragraphText(p.comment)}</p>`
    + eventBlock(p)
    + `<p>${button(p.eventUrl, 'Anlass öffnen', PRIMARY)}</p>`);
  return { subject, html };
}

export function answerConfirmPage(p: EventSummary & { answer: 'accept' | 'decline'; postUrl: string; invitationKey: string; signature: string }): string {
  const question = p.answer === 'accept' ? 'Möchtest du zusagen?' : 'Möchtest du absagen?';
  const label = p.answer === 'accept' ? 'Teilnahme bestätigen' : 'Absage bestätigen';
  return layout(p.appName,
    `<h1 style="font-size:20px;margin:0 0 8px;">${question}</h1>`
    + eventBlock(p)
    + `<form method="post" action="${escapeHtml(p.postUrl)}">`
    + `<input type="hidden" name="i" value="${escapeHtml(p.invitationKey)}">`
    + `<input type="hidden" name="a" value="${p.answer}">`
    + `<input type="hidden" name="s" value="${escapeHtml(p.signature)}">`
    + `<button type="submit" style="${PRIMARY}border:0;cursor:pointer;font-size:16px;">${label}</button>`
    + `</form>`);
}

export function answerResultPage(p: { appName: string; title: string; message: string; eventUrl?: string }): string {
  const link = p.eventUrl ? `<p>${button(p.eventUrl, 'Anlass in der App öffnen', SECONDARY)}</p>` : '';
  return layout(p.appName,
    `<h1 style="font-size:20px;margin:0 0 8px;">${escapeHtml(p.title)}</h1>`
    + `<p>${escapeHtml(p.message)}</p>`
    + link);
}

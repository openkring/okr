// apps/functions/src/calendar/mail.ts
//
// HTML for the calendar notification emails and the answer pages (spec 1.73 §2–§5).
// Pure string builders: every piece of user text goes through escapeHtml, the rest is fixed
// copy. Inline styles only — mail clients drop <style> blocks.
//
// Every mail and every answer page opens with the same tenant banner (brand colour + logo), so
// the landing page visibly belongs to the mail that led there. The banner is a table with
// `bgcolor` because Outlook renders through Word, which ignores a <div> background.

import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

/** The tenant's look: app-config `appName`, `brandColor` and the raster logo beside `logoUrl`. */
export interface Brand {
  appName: string;
  /** '#rrggbb'; anything else falls back to DEFAULT_BRAND_COLOR (it lands in a style attribute). */
  brandColor?: string;
  /** Absolute raster URL; '' = banner without logo. */
  logoUrl?: string;
}

export interface EventSummary extends Brand {
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

export const DEFAULT_BRAND_COLOR = '#1f6feb';
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A safe '#rrggbb' for a style attribute. */
export function brandColorOf(value: string | undefined): string {
  const color = (value ?? '').trim();
  if (!HEX_COLOR.test(color)) return DEFAULT_BRAND_COLOR;
  return color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color.toLowerCase();
}

/**
 * White text where it stays readable on the brand colour (contrast ≥ 3:1, enough for the bold
 * banner and button text), dark text otherwise — e.g. a light green brand gets dark text.
 */
export function textColorOn(background: string): string {
  const hex = brandColorOf(background);
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05) >= 3 ? '#ffffff' : '#1f2328';
}

const BUTTON = 'display:inline-block;padding:10px 18px;margin:4px 8px 4px 0;border-radius:6px;text-decoration:none;font-weight:600;';
const SECONDARY = `${BUTTON}background:#eef1f5;color:#1f2328;`;

function primaryStyle(brand: Brand): string {
  const color = brandColorOf(brand.brandColor);
  return `${BUTTON}background:${color};color:${textColorOn(color)};`;
}

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

function banner(brand: Brand): string {
  const color = brandColorOf(brand.brandColor);
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" width="48" height="48" alt="" style="display:inline-block;vertical-align:middle;width:48px;height:48px;border:0;border-radius:8px;margin-right:12px;padding:4px;background:#ffffff;">`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${color}" style="background:${color};border-radius:8px;margin:0 0 24px;">`
    + `<tr><td style="padding:16px 20px;">${logo}`
    + `<span style="vertical-align:middle;font-size:18px;font-weight:600;color:${textColorOn(color)};">${escapeHtml(brand.appName)}</span>`
    + `</td></tr></table>`;
}

function layout(brand: Brand, body: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(brand.appName)}</title></head>`
    + `<body style="margin:0;padding:24px 16px;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328;line-height:1.5;">`
    + `<div style="max-width:560px;margin:0 auto;">`
    + banner(brand)
    + body
    + `</div></body></html>`;
}

/**
 * One «Antworten» button: a mail link cannot answer by itself (scanners open every link, see
 * answer.ts), so it leads to the answer page, where the invitee says yes or no.
 */
export function invitationEmail(p: EventSummary & { inviterName: string; note: string; respondUrl: string }): { subject: string; html: string } {
  const subject = p.when ? `Einladung: ${p.eventName}, ${p.when}` : `Einladung: ${p.eventName}`;
  const note = p.note.trim() ? `<p>${paragraphText(p.note.trim())}</p>` : '';
  const html = layout(p,
    `<p>${escapeHtml(p.inviterName)} lädt dich ein:</p>`
    + eventBlock(p)
    + note
    + `<p>Nimmst du teil?</p>`
    + `<p>${button(p.respondUrl, 'Antworten', primaryStyle(p))}</p>`);
  return { subject, html };
}

export function commentEmail(p: EventSummary & { authorName: string; comment: string; eventUrl: string }): { subject: string; html: string } {
  const subject = `${p.authorName} hat ${p.eventName} kommentiert`;
  const html = layout(p,
    `<p>${escapeHtml(p.authorName)} hat einen Kommentar geschrieben:</p>`
    + `<p style="margin:16px 0;padding:12px 16px;border-left:3px solid #d0d7de;">${paragraphText(p.comment)}</p>`
    + eventBlock(p)
    + `<p>${button(p.eventUrl, 'Anlass öffnen', primaryStyle(p))}</p>`);
  return { subject, html };
}

const CURRENT_ANSWER: Record<string, string> = {
  accepted: 'Du hast bereits zugesagt. Du kannst deine Antwort hier ändern.',
  declined: 'Du hast bereits abgesagt. Du kannst deine Antwort hier ändern.',
};

/**
 * The answer page behind «Antworten». One form, one submit button per allowed answer — the
 * pressed button's name/value carries the answer. `answers` is both for a current link, only the
 * signed one for a legacy link.
 */
export function answerPage(p: EventSummary & { answers: ('accept' | 'decline')[]; state?: string; postUrl: string; invitationKey: string; signature: string }): string {
  const current = p.state ? CURRENT_ANSWER[p.state] : undefined;
  const submit = (answer: 'accept' | 'decline', label: string, style: string): string =>
    p.answers.includes(answer)
      ? `<button type="submit" name="a" value="${answer}" style="${style}border:0;cursor:pointer;font-size:16px;font-family:inherit;">${label}</button>`
      : '';
  return layout(p,
    `<h1 style="font-size:20px;margin:0 0 8px;">Nimmst du teil?</h1>`
    + eventBlock(p)
    + (current ? `<p style="color:#57606a;">${current}</p>` : '')
    + `<form method="post" action="${escapeHtml(p.postUrl)}">`
    + `<input type="hidden" name="i" value="${escapeHtml(p.invitationKey)}">`
    + `<input type="hidden" name="s" value="${escapeHtml(p.signature)}">`
    + submit('accept', 'Ich nehme teil', primaryStyle(p))
    + submit('decline', 'Ich nehme nicht teil', SECONDARY)
    + `</form>`);
}

export function answerResultPage(p: Brand & { title: string; message: string; eventUrl?: string }): string {
  const link = p.eventUrl ? `<p>${button(p.eventUrl, 'Anlass in der App öffnen', SECONDARY)}</p>` : '';
  return layout(p,
    `<h1 style="font-size:20px;margin:0 0 8px;">${escapeHtml(p.title)}</h1>`
    + `<p>${escapeHtml(p.message)}</p>`
    + link);
}

// apps/functions/src/email/mail-page/mail-section-templates.ts
//
// One Handlebars template per mail section type (spec 1.172 §7.3). Each renders one full-width table row
// for the `{{{content}}}` slot of the tenant's email layout, which sets the 600 px width.
//
// Mail clients (Outlook above all) read tables and inline styles, nothing else: no flex, no grid, no
// <style> block. The markup uses only what `sanitizeEmailBody` keeps, because `composeBody` sanitizes
// the mail body again: no `role`, `bgcolor` or `valign`; `cellpadding`/`cellspacing`/`border` only on
// <table>; no <p> (the sanitizer prepends a margin to every <p>, so templates use <div>).
//
// `{{...}}` escapes; `{{{...}}}` is only ever used for `html`, which the renderer has sanitized.
import type { MailSectionType } from '@okr/shared-models';

const TEXT_STYLE = 'font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222;';

const ARTICLE = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px 0;${TEXT_STYLE}">
{{#if image}}{{#if image.src}}<img src="{{image.src}}" alt="{{image.alt}}" width="600" style="display:block;width:100%;max-width:100%;height:auto;border:0;margin:0 0 16px 0;" />{{else}}<div style="margin:0 0 16px 0;font-style:italic;color:#666666;">{{image.alt}}</div>{{/if}}{{/if}}
{{#if title}}<h2 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#222222;">{{title}}</h2>{{/if}}
{{#if subTitle}}<h3 style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.4;color:#555555;font-weight:normal;">{{subTitle}}</h3>{{/if}}
{{#if html}}<div>{{{html}}}</div>{{/if}}
</td></tr></table>`;

// A bulletproof button: the coloured cell carries the background, so the button shows in Outlook too.
const BUTTON = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 24px 0;">
<table cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border-radius:4px;background-color:#222222;">
<a href="{{url}}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:4px;">{{label}}</a>
</td></tr></table>
</td></tr></table>`;

const EVENTS = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px 0;${TEXT_STYLE}">
{{#if title}}<h2 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#222222;">{{title}}</h2>{{/if}}
<table width="100%" cellpadding="0" cellspacing="0" border="0">
{{#each lines}}<tr><td width="30%" style="padding:6px 12px 6px 0;border-bottom:1px solid #eeeeee;${TEXT_STYLE}white-space:nowrap;">{{date}}{{#if time}}<br />{{time}}{{/if}}</td><td style="padding:6px 0;border-bottom:1px solid #eeeeee;${TEXT_STYLE}"><strong>{{title}}</strong>{{#if place}}<br /><span style="color:#555555;">{{place}}</span>{{/if}}</td></tr>
{{/each}}</table>
</td></tr></table>`;

/** Handlebars sources, one per mail section type; the renderer refuses any other type. */
export const MAIL_SECTION_TEMPLATES: Record<MailSectionType, string> = {
  article: ARTICLE,
  button: BUTTON,
  events: EVENTS,
};

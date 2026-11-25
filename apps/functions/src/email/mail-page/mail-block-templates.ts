// apps/functions/src/email/mail-page/mail-block-templates.ts
//
// One Handlebars template per block of a Versand mail (spec 1.176 §9.1). Each renders one full-width table; a mail is the
// tables one after the other in the `{{{content}}}` slot of the tenant's layout (440 px wide in the seeded layouts).
//
// What the markup may use is what `sanitizeEmailBody` keeps: no `role`, `bgcolor`, `valign`, no <style>, no comments, so no
// media query and no Outlook condition. No <p> (the sanitizer prepends a margin to every <p>). Inside a template there is no
// line break: `htmlToText` (the plain text half) keeps them. Every cell sets its own text and background colour (`cell`), so
// that a program that inverts colours stays readable; on paper (`print`) no template sets a background. A highlight that the
// author set in a text stays, in the mail and on paper.
//
// `{{...}}` escapes; `{{{...}}}` is only used for `html`, which the renderer has sanitized.
import type { MailBlockType } from '@okr/shared-models';

const TABLE = '<table width="100%" cellpadding="0" cellspacing="0" border="0"';
const FONT = 'font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;';
// Outlook for Windows ignores word-break; `word-wrap` is what it reads
const WRAP = 'word-wrap:break-word;word-break:break-word;';

const TEXT = `${TABLE}><tr><td align="{{align}}" style="padding:0 0 16px 0;text-align:{{align}};${FONT}${WRAP}{{cell}}">{{{html}}}</td></tr></table>`;

// `width`: what Outlook for Windows draws; everything else follows the style, so a picture shrinks with its cell. On paper
// the height is capped, so the width follows it.
const PICTURE = `<div{{#unless src}} style="font-style:italic;"{{/unless}}>{{#if href}}<a href="{{href}}" target="_blank">{{/if}}`
  + `{{#if src}}<img src="{{src}}" alt="{{alt}}" width="{{width}}" style="display:block;{{#if print}}width:auto;max-width:{{maxWidth}};max-height:80mm;{{else}}width:100%;max-width:{{maxWidth}};{{/if}}height:auto;border:0;" />{{else}}{{alt}}{{/if}}`
  + `{{#if href}}</a>{{/if}}</div>`;
const CAPTION_LINES = '{{#each captionLines}}{{#unless @first}}<br />{{/unless}}{{this}}{{/each}}';
const CAPTION_STYLE = 'font-size:13px;line-height:1.4;font-style:italic;color:#555555;';
const PICTURE_WITH_CAPTION = `{{#if captionAbove}}<div style="padding:0 0 6px 0;${CAPTION_STYLE}">${CAPTION_LINES}</div>{{/if}}${PICTURE}`
  + `{{#if captionBelow}}<div style="padding:6px 0 0 0;${CAPTION_STYLE}">${CAPTION_LINES}</div>{{/if}}`;

const IMAGE = `${TABLE}><tr><td style="padding:0 0 16px 0;${FONT}{{cell}}">${PICTURE_WITH_CAPTION}</td></tr></table>`;

// Plain cells: the pairs stay side by side on the phone too.
const GALLERY = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">{{#each rows}}<tr>{{#each this}}`
  + `<td width="50%" style="padding:{{#if @first}}0 8px 16px 0{{else}}0 0 16px 8px{{/if}};vertical-align:top;${FONT}{{cell}}">{{#if alt}}${PICTURE_WITH_CAPTION}{{else}}{{#if src}}${PICTURE_WITH_CAPTION}{{/if}}{{/if}}</td>`
  + `{{/each}}</tr>{{/each}}</table>`;

// The coloured cell carries the background, so the button shows in Outlook too; it reads `mso-padding-alt` where it ignores
// the padding of a link. Outlook draws square corners. On paper: label and address.
// No `text-align` beside a table: it would switch off what `align` does to the table.
const BUTTON = `${TABLE}><tr><td align="{{align}}" style="padding:0 0 16px 0;{{#if print}}text-align:{{align}};{{/if}}${FONT}${WRAP}{{cell}}">`
  + `{{#if print}}<strong>{{label}}</strong><br />{{address}}{{else}}`
  + `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:{{margin}};"><tr><td align="center" style="border:2px solid {{color}};border-radius:4px;mso-padding-alt:10px 26px;color:{{textColor}};background-color:{{background}};">`
  + `<a href="{{url}}" target="_blank" style="display:inline-block;padding:10px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;color:{{textColor}};text-decoration:none;">{{label}}</a>`
  + `</td></tr></table>{{/if}}</td></tr></table>`;

/** Below this width of the content the columns stand one above the other. */
const BREAKPOINT = 400;
// Left-aligned tables, no media query. A program that calculates: the `calc` is far below 0 when the content is wider than
// the breakpoint, so `min-width` (the column's share) wins and the tables stand next to each other; below it, it is huge and
// `max-width` (full) wins. Outlook for Windows ignores all three and takes the `width` attribute. The gutter is the right
// padding of every column but the last; stacked, such a column is wider by that padding (`max-width` above 100 %), so that
// its content is as wide as the others', and the wrapper cuts the padding off. `fixed`: a long word or a picture must not
// widen a column, which would break the row. On paper: cells of one row.
const COLUMNS = `${TABLE}>{{#if print}}<tr>{{#each columns}}<td width="{{width}}%" style="padding:0 {{gutter}}px 0 0;vertical-align:top;${FONT}{{cell}}">{{{html}}}</td>{{/each}}</tr>{{else}}`
  + `<tr><td style="padding:0;${FONT}{{cell}}"><div style="overflow:hidden;">{{#each columns}}`
  + `<table align="left" width="{{width}}%" cellpadding="0" cellspacing="0" border="0" style="width:calc((${BREAKPOINT}px - 100%) * 999);min-width:{{minWidth}}%;max-width:{{maxWidth}}%;table-layout:fixed;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">`
  + `<tr><td style="padding:0 {{gutter}}px 0 0;vertical-align:top;${FONT}{{cell}}">{{{html}}}</td></tr></table>`
  + `{{/each}}</div></td></tr>{{/if}}</table>`;

const CALLOUT = `${TABLE}><tr><td style="padding:0 0 16px 0;${FONT}{{cell}}">${TABLE}><tr>`
  + `<td style="padding:16px;${FONT}${WRAP}{{#if print}}border:1px solid #999999;color:#222222;{{else}}color:#222222;background-color:{{tint}};{{/if}}">{{{html}}}</td>`
  + `</tr></table></td></tr></table>`;

const DIVIDER = `${TABLE}><tr><td style="padding:0 0 16px 0;border-top:1px solid #cccccc;font-size:1px;line-height:1px;{{cell}}"></td></tr></table>`;

const SPACE = `${TABLE}><tr><td height="{{height}}" style="padding:0;height:{{height}}px;line-height:{{height}}px;mso-line-height-rule:exactly;font-size:1px;{{cell}}"></td></tr></table>`;

const EVENT_CELL = `border-bottom:1px solid #eeeeee;vertical-align:top;${FONT}{{../cell}}`;
// The blank after date and time separates them from the title in the plain text half.
const EVENTS = `${TABLE}><tr><td style="padding:0 0 16px 0;${FONT}{{cell}}">`
  + `{{#if title}}<h2 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#222222;">{{title}}</h2>{{/if}}`
  + `${TABLE}>{{#each lines}}<tr><td width="30%" style="padding:6px 12px 6px 0;white-space:nowrap;${EVENT_CELL}">{{date}}{{#if time}}<br />{{time}}{{/if}} </td>`
  + `<td style="padding:6px 0;${WRAP}${EVENT_CELL}"><strong>{{title}}</strong>{{#if place}}<br /><span style="color:#555555;">{{place}}</span>{{/if}}</td></tr>{{/each}}</table>`
  + `</td></tr></table>`;

/** Handlebars sources, one per block type; the renderer refuses any other type. */
export const MAIL_BLOCK_TEMPLATES: Record<MailBlockType, string> = {
  text: TEXT,
  image: IMAGE,
  gallery: GALLERY,
  button: BUTTON,
  columns: COLUMNS,
  callout: CALLOUT,
  divider: DIVIDER,
  space: SPACE,
  events: EVENTS,
};

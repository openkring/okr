import { getCountryName } from '@bk2/shared-util-core';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { SignatureModel, SignatureRender } from './signature.model';

/**
 * The single source of truth for the email signature (spec §4).
 *
 * `renderSignature` produces the **base**, email-safe signature: table-based layout,
 * fully inline CSS, absolute `https://` image URL, fixed pixel dimensions. Preview and
 * every copy path run this same output (then `adaptForClient`), so what the user sees is
 * exactly what they install. Keep it dumb: all composition (address line, phone formatting)
 * happens here so the template body just interpolates ready-made, escaped strings.
 */

/** HTML-escape a value for safe interpolation (names/orgs may contain `&`, `<`, accents). */
export function escapeSignatureHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Human-readable phone derived from the canonical E.164 string
 * (`+41797908929` → `+41 79 790 8929`). Falls back to the raw input if it can't be parsed.
 */
export function formatSignaturePhone(phoneE164: string): string {
  return parsePhoneNumberFromString(phoneE164)?.formatInternational() ?? phoneE164;
}

/** Canonical E.164 for the `tel:` href; falls back to the raw input. */
export function normalizePhoneHref(phoneE164: string): string {
  return parsePhoneNumberFromString(phoneE164)?.number ?? phoneE164;
}

/**
 * Compose the org address line once (`"8712 Stäfa, SWITZERLAND"`) so the template stays dumb.
 * The country name is emitted in upper-case English to match the reference layout (spec §4)
 * and the vCard export convention. Missing parts are omitted gracefully.
 */
export function composeOrgAddressLine(zipCode: string, city: string, countryCode: string): string {
  const place = [zipCode?.trim(), city?.trim()].filter(Boolean).join(' ');
  const country = countryCode ? getCountryName(countryCode, 'en').toUpperCase() : '';
  return [place, country].filter(Boolean).join(', ');
}

/** Produce the base, email-safe signature fragment + plain-text fallback (spec §4). */
export function renderSignature(model: SignatureModel): SignatureRender {
  const { person, org } = model;
  const rows: string[] = [];

  // display name — bold, large
  rows.push(
    `  <tr><td style="padding:0;font-size:20px;font-weight:bold;line-height:1.3;color:#000000;">${escapeSignatureHtml(person.displayName)}</td></tr>`,
  );

  // function / role (optional)
  if (person.functionLabel?.trim()) {
    rows.push(
      `  <tr><td style="padding:3px 0 0 0;font-size:13px;line-height:1.4;color:#333333;">${escapeSignatureHtml(person.functionLabel.trim())}</td></tr>`,
    );
  }

  // phone (optional, tel: link)
  if (person.phoneE164?.trim()) {
    const display = escapeSignatureHtml(formatSignaturePhone(person.phoneE164));
    const href = escapeSignatureHtml(normalizePhoneHref(person.phoneE164));
    rows.push(
      `  <tr><td style="padding:3px 0 0 0;font-size:15px;line-height:1.4;color:#555555;">` +
        `<a href="tel:${href}" style="color:#555555;text-decoration:none;">${display}</a></td></tr>`,
    );
  }

  // vertical gap
  rows.push(`  <tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>`);

  // logo + org name/address
  const logoImg =
    `<img src="${escapeSignatureHtml(org.logoUrl)}" width="50" height="50" alt="${escapeSignatureHtml(org.name)}" ` +
    `style="display:block;border:0;outline:none;width:50px;height:50px;" />`;
  const logoCell = org.websiteUrl?.trim()
    ? `<a href="${escapeSignatureHtml(org.websiteUrl.trim())}" style="text-decoration:none;">${logoImg}</a>`
    : logoImg;
  rows.push(
    `  <tr>\n` +
      `    <td style="padding:0;">\n` +
      `      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">\n` +
      `        <tr>\n` +
      `          <td valign="middle" style="padding:0 16px 0 0;">${logoCell}</td>\n` +
      `          <td valign="middle" style="font-size:14px;line-height:1.45;color:#333333;">\n` +
      `            <span style="font-size:15px;font-weight:bold;color:#000000;">${escapeSignatureHtml(org.name)}</span><br>\n` +
      `            ${escapeSignatureHtml(org.addressLine)}\n` +
      `          </td>\n` +
      `        </tr>\n` +
      `      </table>\n` +
      `    </td>\n` +
      `  </tr>`,
  );

  const html =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">\n` +
    rows.join('\n') +
    `\n</table>`;

  return { html, text: renderText(model) };
}

/** Plain-text fallback (spec §4), prefixed with the RFC 3676 `-- ` delimiter. */
function renderText(model: SignatureModel): string {
  const { person, org } = model;
  const lines = ['-- ', person.displayName];
  if (person.functionLabel?.trim()) lines.push(person.functionLabel.trim());
  if (person.phoneE164?.trim()) lines.push(formatSignaturePhone(person.phoneE164));
  lines.push('', org.name, org.addressLine);
  return lines.join('\n');
}

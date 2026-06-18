// libs/pdf-template/util/src/lib/email-html.util.ts
// Pure helpers for composing the outgoing document email — no Angular/DOM deps.

/** Brand colour, matching the editor heading colour used elsewhere in the app. */
const BRAND_COLOR = '#25265e';

export interface BrandedEmailOptions {
  /** Organisation / app name shown in the header and footer. */
  orgName: string;
  /** Absolute, publicly reachable logo URL (PNG/JPG). SVGs are unreliable in email clients. */
  logoUrl?: string;
  /** Contact email rendered as a mailto link in the footer. */
  contactEmail?: string;
  /** Filename of the attached document, shown as a "Beilage" note. */
  attachmentFilename?: string;
}

/** Split a comma-separated address string into trimmed, non-empty entries. */
export function parseEmails(raw: string): string[] {
  return raw.split(',').map((e) => e.trim()).filter(Boolean);
}

/** Minimal HTML-escaping for text interpolated into the email markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wrap a (rich-text) message body in a branded, responsive, inline-CSS HTML email.
 * Table-based layout for broad email-client compatibility.
 *
 * @param bodyHtml the message body as HTML (e.g. from bk-editor)
 * @param opts branding + attachment metadata
 * @returns a self-contained HTML document string
 */
export function buildBrandedEmailHtml(bodyHtml: string, opts: BrandedEmailOptions): string {
  const orgName = escapeHtml(opts.orgName);
  const isAbsolute = !!opts.logoUrl && /^https?:\/\//.test(opts.logoUrl);

  const header = isAbsolute
    ? `<img src="${opts.logoUrl}" alt="${orgName}" height="40" style="height:40px;display:block;border:0;outline:none;text-decoration:none;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:600;">${orgName}</span>`;

  const attachmentNote = opts.attachmentFilename
    ? `<tr><td style="padding:0 32px 24px;">
         <div style="border-top:1px solid #eeeeee;padding-top:16px;color:#555555;font-size:14px;">
           📎 Beilage: <strong>${escapeHtml(opts.attachmentFilename)}</strong>
         </div>
       </td></tr>`
    : '';

  const footerContact = opts.contactEmail
    ? ` · <a href="mailto:${opts.contactEmail}" style="color:#888888;">${escapeHtml(opts.contactEmail)}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${orgName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:${BRAND_COLOR};padding:20px 32px;">${header}</td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px;color:#222222;font-size:15px;line-height:1.5;">${bodyHtml}</td>
        </tr>
        ${attachmentNote}
        <tr>
          <td style="padding:16px 32px;background-color:#fafafa;color:#888888;font-size:12px;border-top:1px solid #eeeeee;">
            ${orgName}${footerContact}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

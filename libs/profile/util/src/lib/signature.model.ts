/**
 * Personalised email-signature export (spec 2026-06-16).
 *
 * The whole feature is built from these types: a presentation-ready `SignatureModel`
 * is rendered by `renderSignature` into a base `SignatureRender`, then hardened per
 * client by `adaptForClient` into a `ClientPlan`. Nothing is persisted — the form
 * state is ephemeral local UI state.
 */

/** The five email clients the export is adapted for. */
export type EmailClient =
  | 'gmail'           // Gmail web
  | 'outlook-web'     // new Outlook / OWA / Microsoft 365
  | 'outlook-win'     // Outlook for Windows, classic desktop
  | 'apple-mail-mac'  // Apple Mail, macOS
  | 'apple-mail-ios'; // Apple Mail, iOS

/**
 * `html` = formatted paste into a rich editor; `raw` = HTML source as plain text;
 * `text-only` = the plain-text signature (RFC 3676 `-- ` block), no markup.
 */
export type CopyFormat = 'html' | 'raw' | 'text-only';

/** Resolved, presentation-ready signature inputs (spec §3.1). */
export interface SignatureModel {
  person: {
    displayName: string;     // "Bruno Kaiser" — from the profile
    functionLabel?: string;  // "Finanzen" — free text from the form, optional
    phoneE164?: string;      // "+41797908929" — canonical E.164 (source of truth)
    email?: string;          // optional, not in the reference layout
  };
  org: {
    name: string;            // "Seeclub Stäfa"
    addressLine: string;     // "8712 Stäfa, SWITZERLAND" (pre-composed)
    websiteUrl?: string;     // logo link target
    logoUrl: string;         // absolute imgix URL (spec §5)
  };
}

/** Ephemeral local form state — nothing is persisted server-side (spec §3.2). */
export interface SignatureFormState {
  functionLabel: string;  // optional org function, free text, no i18n
  client: EmailClient;    // dropdown selection
  format: CopyFormat;     // segment selection
}

/** Base render output (spec §3.4). */
export interface SignatureRender {
  html: string;  // email-safe HTML fragment
  text: string;  // plain-text fallback, prefixed with "-- \n"
}

/** Short, client-specific install guide shown for the current selection (spec §6.2). */
export interface InstallGuide {
  title: string;        // e.g. "Apple Mail (Mac)"
  steps: string[];      // 3–5 short imperative steps
  rawFallback: string;  // one paragraph: what raw mode is and when to use it
}

/** Client-adapted output + the matching install guide (spec §6.1). */
export interface ClientPlan {
  client: EmailClient;
  html: string;                   // client-adapted email-safe HTML
  text: string;                   // plain-text fallback
  recommendedFormat: CopyFormat;  // pre-selects the segment when the client changes
  guide: InstallGuide;
}

import { ClientPlan, CopyFormat, EmailClient, InstallGuide, SignatureRender } from './signature.model';
import { ProfileI18n } from './profile-i18n';

/**
 * Per-client hardening + install guide (spec §6.1/§6.2).
 *
 * The base `renderSignature` output is already email-safe; `adaptForClient` applies
 * client-specific tweaks on top. Pure, no side effects — preview and every copy path
 * run it so the user installs exactly what they previewed.
 */

/**
 * Outlook for Windows renders via the Word engine and ignores CSS-only line spacing.
 * Inject `mso-line-height-rule:exactly` alongside every `line-height` so spacing survives.
 * All other clients render the base HTML as-is (we ship no `<style>`/classes to strip).
 */
export function hardenHtmlForClient(html: string, client: EmailClient): string {
  if (client === 'outlook-win') {
    return html.replace(/line-height:([^;]+);/g, 'line-height:$1;mso-line-height-rule:exactly;');
  }
  return html;
}

/** Pre-selected segment when the client changes; the user can still override (spec §6.1). */
export function recommendedFormatFor(client: EmailClient): CopyFormat {
  // Every client accepts a formatted (`html`) rich paste as the primary path; `raw`
  // remains available as the file-based fallback explained in the guide. The exhaustive
  // switch keeps this a per-client extension point should a client ever need `raw`.
  switch (client) {
    case 'gmail':
    case 'outlook-web':
    case 'outlook-win':
    case 'apple-mail-mac':
    case 'apple-mail-ios':
      return 'html';
  }
}

/** Build the install guide for the selected client from the resolved i18n strings (spec §6.2). */
export function buildInstallGuide(client: EmailClient, i18n: ProfileI18n): InstallGuide {
  const rawFallback = i18n.sig_guide_raw_fallback();
  switch (client) {
    case 'gmail':
      return {
        title: i18n.sig_client_gmail(),
        steps: [i18n.sig_guide_gmail_s1(), i18n.sig_guide_gmail_s2(), i18n.sig_guide_gmail_s3(), i18n.sig_guide_gmail_s4()],
        rawFallback,
      };
    case 'outlook-web':
      return {
        title: i18n.sig_client_outlookWeb(),
        steps: [i18n.sig_guide_oweb_s1(), i18n.sig_guide_oweb_s2(), i18n.sig_guide_oweb_s3()],
        rawFallback,
      };
    case 'outlook-win':
      return {
        title: i18n.sig_client_outlookWin(),
        steps: [i18n.sig_guide_owin_s1(), i18n.sig_guide_owin_s2(), i18n.sig_guide_owin_s3(), i18n.sig_guide_owin_s4()],
        rawFallback,
      };
    case 'apple-mail-mac':
      return {
        title: i18n.sig_client_appleMac(),
        steps: [i18n.sig_guide_amac_s1(), i18n.sig_guide_amac_s2(), i18n.sig_guide_amac_s3(), i18n.sig_guide_amac_s4()],
        rawFallback,
      };
    case 'apple-mail-ios':
      return {
        title: i18n.sig_client_appleIos(),
        steps: [i18n.sig_guide_aios_s1(), i18n.sig_guide_aios_s2()],
        rawFallback,
      };
  }
}

/** Compose the full client plan: hardened HTML + text + recommended format + guide (spec §6.1). */
export function adaptForClient(base: SignatureRender, client: EmailClient, i18n: ProfileI18n): ClientPlan {
  return {
    client,
    html: hardenHtmlForClient(base.html, client),
    text: base.text,
    recommendedFormat: recommendedFormatFor(client),
    guide: buildInstallGuide(client, i18n),
  };
}

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { DEFAULT_EMAIL_PROVIDER, effectiveProvider, type EmailProvider } from './email-transport';

export interface AppEmailConfig {
  appName: string;
  appDomain: string;
  from: string;
  /** The domain the provider verifies for this tenant: `emailDomain`, else `appDomain`. */
  senderDomain: string;
  replyTo: string;
  continueUrl: string;
  /** Address shown in a composer mail's footer: the tenant's `mailFrom`, else the sender address. */
  contactEmail: string;
  /** Mailtrap template UUID for the password-reset mail ('' when the tenant has none). */
  passwordResetTemplate: string;
}

// Ultimate fallback when the tenant's app-config document is missing/incomplete.
const FALLBACK_DOMAIN = 'bkaiser.ch';
const FALLBACK_APP_NAME = 'bkaiser';
const FALLBACK_LOGIN_PATH = '/auth/login';

/**
 * Resolve the per-tenant email config from the `app-config/{appId}` Firestore document.
 *
 * Multi-tenant by design: the sender domain is ALWAYS derived from `appDomain` (never hardcoded
 * per app), so each tenant sends from its own domain (e.g. app@seeclub.org, app@p13.ch).
 * Note: the configured email provider must authorize that sending domain, otherwise the send fails.
 */
export async function getAppEmailConfig(appId: string): Promise<AppEmailConfig> {
  let appName = FALLBACK_APP_NAME;
  let appDomain = FALLBACK_DOMAIN;
  let loginPath = FALLBACK_LOGIN_PATH;
  let emailDomain = '';
  let passwordResetTemplate = '';
  let mailFrom = '';

  try {
    const snap = await getFirestore().collection('app-config').doc(appId).get();
    const cfg = snap.data();
    if (cfg) {
      appName = String(cfg['appName'] ?? appName);
      appDomain = String(cfg['appDomain'] ?? appDomain) || FALLBACK_DOMAIN;
      loginPath = String(cfg['loginUrl'] ?? loginPath) || FALLBACK_LOGIN_PATH;
      emailDomain = String(cfg['emailDomain'] ?? '');
      passwordResetTemplate = String(cfg['mailtrapPasswordResetTemplate'] ?? '');
      mailFrom = String(cfg['mailFrom'] ?? '').trim();
    }
  } catch {
    // fall through to fallback values
  }

  // The app is served from app.<domain> but mail is sent from the apex — the provider verifies
  // ONE sending domain, so `emailDomain` decouples the sender from the hosting hostname.
  const senderDomain = emailDomain || appDomain;

  const replyTo = `app@${senderDomain}`;

  return {
    appName,
    appDomain,
    from: `"${appName}" <app@${senderDomain}>`,
    senderDomain,
    replyTo,
    continueUrl: `https://${appDomain}${loginPath}`,
    contactEmail: mailFrom || replyTo,
    passwordResetTemplate,
  };
}

/**
 * The email provider the server uses for a tenant: `app-config/{tenantId}.emailProvider`, else
 * `DEFAULT_EMAIL_PROVIDER`. The client never chooses it.
 *
 * Never throws: a failed read must not take the password-reset path down with it, so it logs and
 * falls back to the default, as `getAppEmailConfig` does for its own values.
 */
export async function getEmailProvider(tenantId: string): Promise<EmailProvider> {
  let stored: unknown;
  try {
    const snap = await getFirestore().collection('app-config').doc(tenantId).get();
    stored = snap.data()?.['emailProvider'];
  } catch (e) {
    logger.error(`getEmailProvider: could not read app-config/${tenantId} — using ${DEFAULT_EMAIL_PROVIDER}`, { error: String((e as Error)?.message ?? e) });
    return DEFAULT_EMAIL_PROVIDER;
  }
  const provider = effectiveProvider(stored);
  if (stored !== undefined && stored !== null && stored !== '' && stored !== provider) {
    logger.warn(`getEmailProvider: unknown emailProvider in app-config/${tenantId} — using ${provider}`);
  }
  return provider;
}

/** `"Name" <a@b.ch>` → `a@b.ch`; a bare address passes through. */
export function bareAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
}

const SENDER_ADDRESS = /^[^\s@<>,;"]+@([^\s@<>,;"]+)$/;

/**
 * The sender a caller-supplied `from` may become: itself when its address is on the tenant's sending
 * domain (equal, or either side a subdomain of the other, as `isSenderDomainAllowed` for the composer),
 * else the tenant's own sender. The decision is on the parsed address, never on the display name, so a
 * name like `"info@club.ch" <x@evil.ch>` does not pass. A line break or a second address fails the
 * address pattern and falls back too. Never used on the password-reset path, which has `config.from`.
 */
export function effectiveSender(from: string | undefined, config: { from: string; senderDomain: string }): string {
  if (!from) return config.from;
  const domain = SENDER_ADDRESS.exec(bareAddress(from))?.[1]?.toLowerCase();
  const expected = (config.senderDomain ?? '').trim().toLowerCase();
  if (!domain || !expected || /[\r\n]/.test(from)) return config.from;
  const allowed = domain === expected || domain.endsWith(`.${expected}`) || expected.endsWith(`.${domain}`);
  return allowed ? from : config.from;
}

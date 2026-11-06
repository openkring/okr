import { getFirestore } from 'firebase-admin/firestore';

interface AppEmailConfig {
  appName: string;
  appDomain: string;
  from: string;
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
    replyTo,
    continueUrl: `https://${appDomain}${loginPath}`,
    contactEmail: mailFrom || replyTo,
    passwordResetTemplate,
  };
}

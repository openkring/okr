import { getFirestore } from 'firebase-admin/firestore';

interface AppEmailConfig {
  appName: string;
  from: string;
  replyTo: string;
  continueUrl: string;
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

  try {
    const snap = await getFirestore().collection('app-config').doc(appId).get();
    const cfg = snap.data();
    if (cfg) {
      appName = String(cfg['appName'] ?? appName);
      appDomain = String(cfg['appDomain'] ?? appDomain) || FALLBACK_DOMAIN;
      loginPath = String(cfg['loginUrl'] ?? loginPath) || FALLBACK_LOGIN_PATH;
    }
  } catch {
    // fall through to fallback values
  }

  return {
    appName,
    from: `"${appName}" <app@${appDomain}>`,
    replyTo: `app@${appDomain}`,
    continueUrl: `https://${appDomain}${loginPath}`,
  };
}

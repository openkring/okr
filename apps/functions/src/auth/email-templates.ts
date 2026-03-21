interface AppEmailConfig {
  appName: string;
  from: string;
  replyTo: string;
  continueUrl: string;
  primaryColor: string;
  logoUrl: string;
}

const APP_CONFIGS: Record<string, AppEmailConfig> = {
  scs: {
    appName: 'Seeclub Stäfa',
    from: '"Seeclub Stäfa" <app@seeclub.org>',
    replyTo: 'app@seeclub.org',
    continueUrl: 'https://seeclub.org/auth/login',
    primaryColor: '#1a73e8',
    logoUrl: 'https://bkaiser.imgix.net/tenant/scs/logo/logo.svg',
  },
  test: {
    appName: 'bkaiser test',
    from: '"bkaiser" <app@seeclub.org>',
    replyTo: 'info@seeclub.org',
    continueUrl: 'https://bkaiser.org/auth/login',
    primaryColor: '#1a73e8',
    logoUrl: 'https://bkaiser.imgix.net/tenant/test/logo/logo.svg ',
  },
};

const DEFAULT_CONFIG: AppEmailConfig = {
  appName: 'bkaiser',
  from: '"bkaiser" <app@bkaiser.ch>',
  replyTo: 'info@bkaiser.ch',
  continueUrl: 'https://bkaiser.ch/auth/login',
  primaryColor: '#1a73e8',
  logoUrl: '',
};

export function getAppEmailConfig(appId: string): AppEmailConfig {
  return APP_CONFIGS[appId] ?? DEFAULT_CONFIG;
}

export function buildPasswordResetHtml(appName: string, primaryColor: string, logoUrl: string, email: string, link: string): string {
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${appName}" style="max-height:60px;margin-bottom:16px;" /><br/>`
    : '';
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${primaryColor};padding:24px 32px;text-align:center;">
          ${logoHtml}
          <span style="color:#ffffff;font-size:22px;font-weight:bold;">${appName}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;color:#333;">Hallo,</p>
          <p style="margin:0 0 16px;font-size:15px;color:#555;">
            Wir haben eine Anfrage erhalten, das Passwort für das Konto <strong>${email}</strong> zurückzusetzen.
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#555;">
            Klicke auf den folgenden Button, um dein Passwort zurückzusetzen:
          </p>
          <p style="text-align:center;margin:0 0 24px;">
            <a href="${link}" style="display:inline-block;padding:14px 32px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold;">
              Passwort zurücksetzen
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#999;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
          </p>
          <p style="margin:0 0 24px;font-size:12px;color:#aaa;word-break:break-all;">${link}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="margin:0;font-size:13px;color:#aaa;">
            Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.
          </p>
        </td></tr>
        <tr><td style="background:#f8f8f8;padding:16px 32px;text-align:center;">
          <span style="font-size:12px;color:#bbb;">&copy; ${new Date().getFullYear()} ${appName}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

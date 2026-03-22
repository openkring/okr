interface AppEmailConfig {
  appName: string;
  from: string;
  replyTo: string;
  continueUrl: string;
}

const APP_CONFIGS: Record<string, AppEmailConfig> = {
  scs: {
    appName: 'Seeclub Stäfa',
    from: '"Seeclub Stäfa" <app@seeclub.org>',
    replyTo: 'app@seeclub.org',
    continueUrl: 'https://seeclub.org/auth/login',
  },
  test: {
    appName: 'bkaiser test',
    from: '"bkaiser" <app@seeclub.org>',
    replyTo: 'info@seeclub.org',
    continueUrl: 'https://bkaiser.org/auth/login',
  },
};

const DEFAULT_CONFIG: AppEmailConfig = {
  appName: 'bkaiser',
  from: '"bkaiser" <app@bkaiser.ch>',
  replyTo: 'info@bkaiser.ch',
  continueUrl: 'https://bkaiser.ch/auth/login',
};

export function getAppEmailConfig(appId: string): AppEmailConfig {
  return APP_CONFIGS[appId] ?? DEFAULT_CONFIG;
}


import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/angular';
import { beforeSend, buildSentryOptions, SentryConfig } from './sentry';

const cfg: SentryConfig = {
  dsn: 'https://abc@o1.ingest.de.sentry.io/2',
  environment: 'production',
  release: 'scs@1.2.3',
  tracesSampleRate: 0.1,
  enabled: true,
};

describe('buildSentryOptions', () => {
  it('passes through dsn, environment, release and enabled', () => {
    const o = buildSentryOptions(cfg, []);
    expect(o.dsn).toBe(cfg.dsn);
    expect(o.environment).toBe('production');
    expect(o.release).toBe('scs@1.2.3');
    expect(o.enabled).toBe(true);
  });

  it('never auto-attaches PII and always installs beforeSend', () => {
    const o = buildSentryOptions(cfg, []);
    expect(o.sendDefaultPii).toBe(false);
    expect(o.beforeSend).toBe(beforeSend);
  });
});

describe('beforeSend', () => {
  it('drops development events entirely', () => {
    const event = { environment: 'development', message: 'boom' } as ErrorEvent;
    expect(beforeSend(event, {})).toBeNull();
  });

  it('redacts the message of a production event', () => {
    const event = { environment: 'production', message: 'fail for a@b.ch' } as ErrorEvent;
    const out = beforeSend(event, {});
    expect(out?.message).toBe('fail for [EMAIL]');
  });

  it('redacts exception values and breadcrumb messages', () => {
    const event = {
      environment: 'production',
      exception: { values: [{ value: 'AHV 756.1234.5678.90' }] },
      breadcrumbs: [{ message: 'iban CH93 0076 2011 6238 5295 7' }],
    } as unknown as ErrorEvent;
    const out = beforeSend(event, {});
    expect(out?.exception?.values?.[0].value).toContain('[AHV]');
    expect(out?.breadcrumbs?.[0].message).toContain('[IBAN]');
  });
});

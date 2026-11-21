import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/angular', () => ({ captureMessage: vi.fn() }));

import { captureMessage } from '@sentry/angular';

/** Fresh module per test: the dedup sets and the registered check are module state. */
async function load() {
  vi.resetModules();
  return import('./i18n-sentry');
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('reportMissingKey', () => {
  beforeEach(() => vi.mocked(captureMessage).mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('reports straight away when no skew check is registered', async () => {
    const { reportMissingKey } = await load();
    reportMissingKey('cmsSectionFeature.a');
    expect(captureMessage).toHaveBeenCalledWith('i18n missing-key: cmsSectionFeature.a', expect.anything());
  });

  it('does not report a key the skew check recovered from', async () => {
    const { reportMissingKey, setI18nSkewCheck } = await load();
    setI18nSkewCheck(() => Promise.resolve(true));
    reportMissingKey('cmsSectionFeature.a');
    await flush();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reports the key when the check finds no skew', async () => {
    const { reportMissingKey, setI18nSkewCheck } = await load();
    setI18nSkewCheck(() => Promise.resolve(false));
    reportMissingKey('cmsSectionFeature.a');
    await flush();
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('reports the key when the check itself fails', async () => {
    const { reportMissingKey, setI18nSkewCheck } = await load();
    setI18nSkewCheck(() => Promise.reject(new Error('offline')));
    reportMissingKey('cmsSectionFeature.a');
    await flush();
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('asks the check once per key, however often the key renders', async () => {
    const { reportMissingKey, setI18nSkewCheck } = await load();
    const check = vi.fn(() => Promise.resolve(false));
    setI18nSkewCheck(check);
    reportMissingKey('cmsSectionFeature.a');
    reportMissingKey('cmsSectionFeature.a');
    reportMissingKey('cmsSectionFeature.b');
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });
});

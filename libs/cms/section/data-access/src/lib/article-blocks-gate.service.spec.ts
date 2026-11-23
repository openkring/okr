import { isDevMode } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreService } from '@okr/shared-data-access';

import { ARTICLE_GATE_TIMEOUT_MS, ArticleBlocksGate, isGateOpen } from './article-blocks-gate.service';

vi.mock('@angular/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@angular/core')>()), isDevMode: vi.fn(() => true) }));

const TRIAL_KEY = 'okr.articleEditor';

/** The gate with the released version a later release will set. */
class ReleasedGate extends ArticleBlocksGate {
  protected override readonly needed: string | undefined = '7.70.0';
}

/** The gate before that release step. Own class, so that setting the constant breaks no test. */
class UnreleasedGate extends ArticleBlocksGate {
  protected override readonly needed: string | undefined = undefined;
}

describe('isGateOpen', () => {
  it('is closed while no version is released', () => {
    expect(isGateOpen(undefined, '99.0.0')).toBe(false);
    expect(isGateOpen('', '99.0.0')).toBe(false);
  });

  it.each([undefined, null, '', '   ', 8, 99.9, true, {}, ['99.0.0'], 'latest', '99.x', '99.0.0-beta', '99..0', 'v99.0.0'])('is closed for the unusable minVersion %j', (minVersion) => {
    expect(isGateOpen('7.70.0', minVersion)).toBe(false);
  });

  it('is closed when the needed version is unusable', () => {
    expect(isGateOpen('next', '99.0.0')).toBe(false);
  });

  it('is closed for a lower minVersion', () => {
    expect(isGateOpen('7.70.0', '7.69.9')).toBe(false);
    expect(isGateOpen('7.70.0', '7.9.0')).toBe(false);    // compared as numbers, not as text
    expect(isGateOpen('7.70.1', '7.70')).toBe(false);
  });

  it('is open for an equal or higher minVersion', () => {
    expect(isGateOpen('7.70.0', '7.70.0')).toBe(true);
    expect(isGateOpen('7.70.0', '7.70')).toBe(true);
    expect(isGateOpen('7.70.0', '7.70.1')).toBe(true);
    expect(isGateOpen('7.70.0', '7.100.0')).toBe(true);
    expect(isGateOpen('7.70.0', '8.0.0')).toBe(true);
  });
});

describe('ArticleBlocksGate', () => {
  const readObjectStrict = vi.fn();

  const gate = <T extends ArticleBlocksGate>(type: new () => T): T => {
    TestBed.configureTestingModule({ providers: [type, { provide: FirestoreService, useValue: { readObjectStrict } }] });
    return TestBed.inject(type);
  };

  beforeEach(() => {
    vi.mocked(isDevMode).mockReturnValue(true);
    readObjectStrict.mockReset();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('is not released yet: closed whatever minVersion says', async () => {
    readObjectStrict.mockResolvedValue({ minVersion: '999.0.0' });
    const service = gate(UnreleasedGate);
    await expect(service.load()).resolves.toBe(false);
    expect(service.open()).toBe(false);
    expect(readObjectStrict).not.toHaveBeenCalled();
  });

  it('is closed before load()', () => {
    expect(gate(ReleasedGate).open()).toBe(false);
  });

  it('opens when every app can read blocks, and reads once per session', async () => {
    readObjectStrict.mockResolvedValue({ minVersion: '7.70.0' });
    const service = gate(ReleasedGate);
    await expect(service.load()).resolves.toBe(true);
    expect(service.open()).toBe(true);
    await expect(service.load()).resolves.toBe(true);
    expect(readObjectStrict).toHaveBeenCalledTimes(1);
    expect(readObjectStrict).toHaveBeenCalledWith('app-version/app-version');
  });

  it('mayWrite follows the released gate', async () => {
    readObjectStrict.mockResolvedValueOnce({ minVersion: '7.69.0' }).mockResolvedValueOnce({ minVersion: '7.70.0' });
    const service = gate(ReleasedGate);
    expect(service.mayWrite()).toBe(false);
    await expect(service.loadMayWrite()).resolves.toBe(false);
    expect(service.mayWrite()).toBe(false);
    await expect(service.loadMayWrite()).resolves.toBe(true);
    expect(service.mayWrite()).toBe(true);
    expect(service.open()).toBe(true);
    await expect(service.load()).resolves.toBe(true);
    expect(readObjectStrict).toHaveBeenCalledTimes(2);
  });

  it('loadMayWrite is closed when app-version cannot be read, and while nothing is released', async () => {
    readObjectStrict.mockRejectedValue(new Error('offline'));
    await expect(gate(ReleasedGate).loadMayWrite()).resolves.toBe(false);
    TestBed.resetTestingModule();
    await expect(gate(UnreleasedGate).loadMayWrite()).resolves.toBe(false);
  });

  it('asks again when it was closed', async () => {
    readObjectStrict.mockResolvedValueOnce({ minVersion: '7.69.0' }).mockResolvedValueOnce({ minVersion: '7.70.0' });
    const service = gate(ReleasedGate);
    await expect(service.load()).resolves.toBe(false);
    expect(service.open()).toBe(false);
    await expect(service.load()).resolves.toBe(true);
    expect(service.open()).toBe(true);
  });

  it('is closed when app-version cannot be read, and asks again', async () => {
    readObjectStrict.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ minVersion: '7.70.0' });
    const service = gate(ReleasedGate);
    await expect(service.load()).resolves.toBe(false);
    expect(service.open()).toBe(false);
    await expect(service.load()).resolves.toBe(true);
  });

  it('is closed when the read throws synchronously', async () => {
    readObjectStrict.mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(gate(ReleasedGate).load()).resolves.toBe(false);
  });

  it.each([null, {}, { minVersion: 8 }, { minVersion: '' }, 'text', { latestVersion: '99.0.0' }])('is closed for the document %j', async (document) => {
    readObjectStrict.mockResolvedValue(document);
    await expect(gate(ReleasedGate).load()).resolves.toBe(false);
  });

  it('reads once for two calls at once', async () => {
    readObjectStrict.mockResolvedValue({ minVersion: '7.70.0' });
    const service = gate(ReleasedGate);
    await expect(Promise.all([service.load(), service.load()])).resolves.toEqual([true, true]);
    expect(readObjectStrict).toHaveBeenCalledTimes(1);
  });

  describe('load() does not wait without end', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('answers with what is known; the late answer counts for the next call', async () => {
      let answer: (document: unknown) => void = () => undefined;
      readObjectStrict.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
      const service = gate(ReleasedGate);
      const loading = service.load();
      await vi.advanceTimersByTimeAsync(ARTICLE_GATE_TIMEOUT_MS - 1);
      let settled = false;
      void loading.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(loading).resolves.toBe(false);
      answer({ minVersion: '7.70.0' });
      await vi.advanceTimersByTimeAsync(0);
      expect(service.open()).toBe(true);
      await expect(service.load()).resolves.toBe(true);
      expect(readObjectStrict).toHaveBeenCalledTimes(1);
    });

    it('leaves no timer when the answer came', async () => {
      readObjectStrict.mockResolvedValue({ minVersion: '7.70.0' });
      await gate(ReleasedGate).load();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('loadMayWrite() is not cut short: its callers have their own bound', async () => {
      readObjectStrict.mockReturnValue(new Promise(() => undefined));
      let settled = false;
      void gate(ReleasedGate).loadMayWrite().then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).toBe(false);
    });
  });

  describe('trial', () => {
    it('is off by default and for any other value', () => {
      expect(gate(ReleasedGate).trial).toBe(false);
      TestBed.resetTestingModule();
      localStorage.setItem(TRIAL_KEY, 'true');
      expect(gate(ReleasedGate).trial).toBe(false);
    });

    it('opens the gate without reading, also while nothing is released', async () => {
      localStorage.setItem(TRIAL_KEY, 'trial');
      const service = gate(UnreleasedGate);
      expect(service.trial).toBe(true);
      expect(service.open()).toBe(true);
      await expect(service.load()).resolves.toBe(true);
      expect(readObjectStrict).not.toHaveBeenCalled();
    });

    it('never opens mayWrite, also when the blocks are released', async () => {
      localStorage.setItem(TRIAL_KEY, 'trial');
      readObjectStrict.mockResolvedValue({ minVersion: '99.0.0' });
      const service = gate(ReleasedGate);
      await expect(service.load()).resolves.toBe(true);
      await expect(service.loadMayWrite()).resolves.toBe(false);
      expect(service.mayWrite()).toBe(false);
      expect(readObjectStrict).not.toHaveBeenCalled();
    });

    it('is always off in a production build', async () => {
      vi.mocked(isDevMode).mockReturnValue(false);
      localStorage.setItem(TRIAL_KEY, 'trial');
      const service = gate(UnreleasedGate);
      expect(service.trial).toBe(false);
      expect(service.open()).toBe(false);
      await expect(service.load()).resolves.toBe(false);
    });

    it('is off when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
      expect(gate(UnreleasedGate).trial).toBe(false);
    });

    it('stays as it was when the flag is removed later', () => {
      localStorage.setItem(TRIAL_KEY, 'trial');
      const service = gate(UnreleasedGate);
      localStorage.clear();
      expect(service.trial).toBe(true);
    });
  });
});

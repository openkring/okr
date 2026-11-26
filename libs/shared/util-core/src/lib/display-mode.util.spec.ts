import { describe, expect, it } from 'vitest';
import { getDisplayMode, isInstalledDisplayMode } from './display-mode.util';

/** A matchMedia stand-in that answers true for exactly one display mode. */
const only = (mode: string) => (query: string) => query === `(display-mode: ${mode})`;

describe('getDisplayMode', () => {
  it('finds each installed mode', () => {
    expect(getDisplayMode(only('standalone'))).toBe('standalone');
    expect(getDisplayMode(only('fullscreen'))).toBe('fullscreen');
    expect(getDisplayMode(only('minimal-ui'))).toBe('minimal-ui');
  });

  it('is a browser tab when no app mode matches', () => {
    expect(getDisplayMode(only('browser'))).toBe('browser');
    expect(getDisplayMode(() => false)).toBe('browser');
  });

  it('prefers fullscreen when a browser answers several modes', () => {
    expect(getDisplayMode(q => q.includes('fullscreen') || q.includes('standalone'))).toBe('fullscreen');
  });

  it('falls back to the iOS flag', () => {
    expect(getDisplayMode(() => false, true)).toBe('standalone');
    expect(getDisplayMode(undefined, true)).toBe('standalone');
    expect(getDisplayMode(undefined, false)).toBe('browser');
    expect(getDisplayMode(undefined)).toBe('browser');
  });
});

describe('isInstalledDisplayMode', () => {
  it('counts every app mode as installed, the browser tab not', () => {
    expect(isInstalledDisplayMode('standalone')).toBe(true);
    expect(isInstalledDisplayMode('fullscreen')).toBe(true);
    expect(isInstalledDisplayMode('minimal-ui')).toBe(true);
    expect(isInstalledDisplayMode('browser')).toBe(false);
  });
});

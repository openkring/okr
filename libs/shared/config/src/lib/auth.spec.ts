import { InjectionToken } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/auth', () => {
  const mockGetAuth = vi.fn(() => ({}));
  const mockConnectAuthEmulator = vi.fn();
  return {
    getAuth: mockGetAuth,
    connectAuthEmulator: mockConnectAuthEmulator,
    __esModule: true,
    // Export mocks for test access
    mockGetAuth,
    mockConnectAuthEmulator,
  };
});

describe('AUTH InjectionToken', () => {
  let AUTH: unknown;

  beforeEach(async () => {
    vi.resetModules();
    // Mock ENV before importing auth.ts
    vi.mock('./env', () => ({
      ENV: { useEmulators: false },
    }));

    // Import after mocks are set
    const authModule = await import('./auth');
    AUTH = authModule.AUTH;
  });

  it('should be an InjectionToken', () => {
    expect(AUTH).toBeDefined();
    expect(AUTH instanceof InjectionToken).toBe(true);
  });
});

/*
  cannot directly unit test the factory because it uses inject outside angular context
  to test this, we would need to use angulars testing utilties or refactor the code
  so that the environment logic is testable separately.
  it('should return auth instance and not call emulator if useEmulators is false'
  it('should connect to emulator if useEmulators is true'
*/

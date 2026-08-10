import { describe, expect, it } from 'vitest';
import { toKioskStatus } from './kiosk-status.service';

const info = { model: 'iPad13,4', operatingSystem: 'ios', osVersion: '18.5', platform: 'ios' };
const seen = '2026-08-10T09:00:00.000Z';

describe('toKioskStatus', () => {
  it('converts the native 0..1 battery level to a percentage', () => {
    const status = toKioskStatus('u1', ['scs'], info, { batteryLevel: 0.87, isCharging: true }, seen);
    expect(status.batteryLevel).toBe(87);
    expect(status.charging).toBe(true);
  });

  it('reports -1 when the platform hides the battery (iOS Safari returns {})', () => {
    expect(toKioskStatus('u1', ['scs'], info, {}, seen).batteryLevel).toBe(-1);
  });

  it('does not confuse an empty battery with an unknown one', () => {
    expect(toKioskStatus('u1', ['scs'], info, { batteryLevel: 0 }, seen).batteryLevel).toBe(0);
  });

  it('carries uid and tenants so the rules and the admin view can match on them', () => {
    const status = toKioskStatus('u1', ['scs'], info, {}, seen);
    expect(status).toMatchObject({ uid: 'u1', tenants: ['scs'], seen });
    expect(status.device).toBe('iPad13,4 · ios 18.5 (ios)');
  });
});

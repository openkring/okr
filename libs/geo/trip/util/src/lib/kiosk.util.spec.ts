import { describe, expect, it } from 'vitest';
import { formatBattery, formatSeenAge, isKioskOnline, KIOSK_COUNTDOWN_DEFAULT, kioskMessageValidations, KIOSK_OFFLINE_AFTER_MS } from './kiosk.util';

const now = Date.parse('2026-08-11T12:00:00.000Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('isKioskOnline', () => {
  it('is online while the heartbeat is younger than two report intervals', () => {
    expect(isKioskOnline(ago(60_000), now)).toBe(true);
    expect(isKioskOnline(ago(KIOSK_OFFLINE_AFTER_MS - 1000), now)).toBe(true);
  });

  it('is offline once the heartbeat is older — the app is not running', () => {
    expect(isKioskOnline(ago(KIOSK_OFFLINE_AFTER_MS + 1000), now)).toBe(false);
  });

  it('treats a missing or unparseable timestamp as offline, never as online', () => {
    expect(isKioskOnline(undefined, now)).toBe(false);
    expect(isKioskOnline('never', now)).toBe(false);
  });
});

describe('formatSeenAge', () => {
  it('scales from minutes to hours to days', () => {
    expect(formatSeenAge(ago(30_000), now)).toBe('gerade eben');
    expect(formatSeenAge(ago(3 * 60_000), now)).toBe('vor 3 Min.');
    expect(formatSeenAge(ago(2 * 3600_000), now)).toBe('vor 2 Std.');
    expect(formatSeenAge(ago(4 * 24 * 3600_000), now)).toBe('vor 4 Tagen');
  });

  it('says "nie" when the kiosk never reported', () => {
    expect(formatSeenAge(undefined, now)).toBe('nie');
  });
});

describe('formatBattery', () => {
  it('renders a percentage, and a dash for the -1 "platform hides it" marker', () => {
    expect(formatBattery(87)).toBe('87%');
    expect(formatBattery(0)).toBe('0%');
    expect(formatBattery(-1)).toBe('—');
    expect(formatBattery(undefined)).toBe('—');
  });
});

describe('kioskMessageValidations', () => {
  const data = (over = {}) => ({ message: 'Boot 3 defekt', withCountdown: false, countdown: KIOSK_COUNTDOWN_DEFAULT, ...over });

  it('requires a message', () => {
    expect(kioskMessageValidations(data()).isValid()).toBe(true);
    expect(kioskMessageValidations(data({ message: '' })).isValid()).toBe(false);
  });

  it('checks the seconds only while the countdown is enabled', () => {
    expect(kioskMessageValidations(data({ countdown: 0 })).isValid()).toBe(true);
    expect(kioskMessageValidations(data({ withCountdown: true, countdown: 0 })).isValid()).toBe(false);
    expect(kioskMessageValidations(data({ withCountdown: true, countdown: 10 })).isValid()).toBe(true);
    expect(kioskMessageValidations(data({ withCountdown: true, countdown: 99999 })).isValid()).toBe(false);
  });
});

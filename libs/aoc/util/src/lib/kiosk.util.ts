import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { numberValidations, stringValidations } from '@okr/shared-util-core';

/**
 * Pure helpers for the AOC kiosk screen. A kiosk reports every 15 minutes
 * (`KioskStatusService.REPORT_INTERVAL_MS`), so its liveness is judged purely from the age of
 * the last `seen` timestamp — see `isKioskOnline`.
 */

/**
 * A kiosk is considered online while its heartbeat is younger than two report intervals.
 * One interval would flag every kiosk that reports a few seconds late; two is late enough to
 * mean "the app is not running" rather than "the report is in flight".
 */
export const KIOSK_OFFLINE_AFTER_MS = 2 * 15 * 60 * 1000;

export function isKioskOnline(seen: string | undefined, nowMs: number): boolean {
  if (!seen) return false;
  const seenMs = Date.parse(seen);
  if (Number.isNaN(seenMs)) return false;
  return nowMs - seenMs < KIOSK_OFFLINE_AFTER_MS;
}

/** Human-readable age of the last heartbeat, e.g. "vor 3 Min.", "vor 2 Std.", "vor 4 Tagen". */
export function formatSeenAge(seen: string | undefined, nowMs: number): string {
  if (!seen) return 'nie';
  const seenMs = Date.parse(seen);
  if (Number.isNaN(seenMs)) return 'nie';
  const minutes = Math.max(0, Math.floor((nowMs - seenMs) / 60000));
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} Tagen`;
}

/** Battery as a percentage, or '—' when the platform hides it (iOS Safari reports -1). */
export function formatBattery(batteryLevel: number | undefined): string {
  return batteryLevel === undefined || batteryLevel < 0 ? '—' : `${batteryLevel}%`;
}

/** Default lifetime of a self-closing kiosk message, in seconds. */
export const KIOSK_COUNTDOWN_DEFAULT = 10;
export const KIOSK_COUNTDOWN_MIN = 3;
export const KIOSK_COUNTDOWN_MAX = 600;

/**
 * A remote message for a kiosk device: the text, plus an optional countdown after which the
 * device closes the message by itself (nobody may be standing in front of an unattended kiosk
 * to press OK).
 */
export interface KioskMessageFormData {
  message: string;
  withCountdown: boolean;
  countdown: number;
}

export const kioskMessageValidations = staticSuite((model: KioskMessageFormData, field?: string) => {
  if (field) only(field);

  stringValidations('message', model.message, DESCRIPTION_LENGTH, 1, true);
  // the seconds only have to make sense while the countdown is switched on
  if (model.withCountdown) {
    numberValidations('countdown', model.countdown, true, KIOSK_COUNTDOWN_MIN, KIOSK_COUNTDOWN_MAX);
  }
});

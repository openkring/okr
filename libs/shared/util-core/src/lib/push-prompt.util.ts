/** Notification permission as the app sees it, on every platform (native and web). */
export type PushPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** «Später» on the push prompt keeps it quiet for this long on this device. */
export const PUSH_PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether to show the in-app push question after login (spec 1.10 Phase 3 follow-up).
 *
 * iOS shows its system prompt only ONCE per app — an accidental «Nicht erlauben» blocks push until
 * the member finds the iPhone settings — so an in-app question comes first, and only where push is
 * the point: the native app and the installed PWA. A plain browser tab keeps the profile button.
 * Never asks again once the member decided, and not while a «Später» snooze runs.
 */
export function shouldAskForPush(input: {
  state: PushPermissionState;
  isNative: boolean;
  isStandalone: boolean;
  snoozedUntil?: number;
  now: number;
}): boolean {
  if (input.state !== 'prompt') return false;
  if (!input.isNative && !input.isStandalone) return false;
  return !(input.snoozedUntil !== undefined && input.now < input.snoozedUntil);
}

/**
 * Whether to snooze the in-app push question after it was answered. Everything except an
 * «Erlauben» that actually ended in `granted` snoozes: «Später», a backdrop tap, and also an
 * «Erlauben» after which the system permission is not granted. iOS can refuse instantly without
 * showing its dialog (and without storing a denial, so the permission stays `prompt`) — without
 * the snooze that device was asked again at every login (SCS-JJ).
 */
export function shouldSnoozePushPrompt(answeredAllow: boolean, system: PushPermissionState): boolean {
  return !answeredAllow || system !== 'granted';
}

/**
 * Whether to tell the member where to turn push on, after «Erlauben» did not end in `granted`.
 * `denied` covers both a refusal in the system dialog and an instant refusal without one (iOS,
 * notifications for the app turned off in the iPhone settings — SCS-JJ); `prompt` means the
 * dialog was dismissed. Neither the in-app prompt nor the profile button can get past that —
 * only the device or browser settings can.
 */
export function shouldShowPushSettingsHint(answeredAllow: boolean, system: PushPermissionState): boolean {
  return answeredAllow && (system === 'denied' || system === 'prompt');
}

/** A long-lived session refreshes its push registration once this much time has passed. */
export const PUSH_REGISTRATION_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Whether this session's push registration needs a silent refresh (1.127). The token doc's
 * `updatedAt` moves only on a registration, and the morning job prunes tokens unused for 60 days
 * together with their Matrix pushers — so a session that stays open for weeks (kiosk iPad,
 * always-open desktop PWA) must re-register now and then. Stale when nothing registered yet in
 * this session, after PUSH_REGISTRATION_REFRESH_MS, or when the last time lies in the future
 * (clock set back — never "fresh forever").
 */
export function isRegistrationStale(lastMs: number | undefined, nowMs: number): boolean {
  if (lastMs === undefined || lastMs > nowMs) return true;
  return nowMs - lastMs >= PUSH_REGISTRATION_REFRESH_MS;
}

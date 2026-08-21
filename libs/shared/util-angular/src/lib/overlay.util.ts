/**
 * Guards against Ionic's controller-level `dismiss()` rejecting when the overlay is already gone.
 *
 * `ModalController`/`PopoverController`/`ActionSheetController.dismiss()` resolve against the
 * *topmost* overlay. When there is none — the overlay dismissed itself first (`dismissOnSelect`,
 * a backdrop tap, a second click on the close button, or a save that awaited a Firestore write
 * while the user closed the modal) — Ionic rejects with the bare **string** `'overlay does not
 * exist'`. Because it is not an `Error`, a `try/catch` around an *unawaited* call never sees it and
 * it surfaces in Sentry as `UnhandledRejection: Non-Error promise rejection captured with value:
 * overlay does not exist` with no stacktrace (SCS-5G).
 *
 * The rejection is never actionable: it only means "the overlay this call wanted to close is
 * already closed", which is the outcome the caller asked for. Only that one rejection is swallowed;
 * anything else still propagates.
 */

/** The exact string Ionic rejects with when no matching overlay is on top. */
const OVERLAY_MISSING = 'overlay does not exist';

/** Narrow Ionic's overlay controllers to the one member used here (they share no base type). */
export interface OverlayDismisser {
  dismiss(data?: unknown, role?: string, id?: string): Promise<boolean>;
}

/**
 * Dismiss the topmost overlay of `controller`, treating an already-dismissed overlay as success.
 *
 * @returns `true` if this call dismissed an overlay, `false` if there was none left to dismiss.
 */
export async function dismissOverlay(
  controller: OverlayDismisser | null | undefined,
  data?: unknown,
  role?: string,
): Promise<boolean> {
  if (!controller) return false;
  try {
    return await controller.dismiss(data, role);
  } catch (ex) {
    if (ex === OVERLAY_MISSING || (ex instanceof Error && ex.message === OVERLAY_MISSING)) return false;
    throw ex;
  }
}

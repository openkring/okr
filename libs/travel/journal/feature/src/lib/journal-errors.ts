import { ToastController } from '@ionic/angular';
import { JournalI18n, JournalWriteRefused, JournalWriteSlow } from '@okr/travel-journal-util';

/**
 * Shows why a journal action failed: no bound author, someone else's block, offline, or anything else.
 * A slow browser write is not a failure: it is still queued, so it gets a calm, longer note instead of a warning.
 */
/**
 * Runs one write step of a longer flow. A slow browser write (JournalWriteSlow) keeps its records — they will land —
 * so it does not stop the flow: it resolves `true` and the caller shows the `write_slow` note once at the end. Any
 * other error is rethrown and stops the flow as before.
 */
export async function continueWhenSlow(step: () => Promise<unknown>): Promise<boolean> {
  try {
    await step();
    return false;
  } catch (error) {
    if (error instanceof JournalWriteSlow) return true;
    throw error;
  }
}

export async function showJournalError(toastController: ToastController, i18n: JournalI18n, error: unknown): Promise<void> {
  if (error instanceof JournalWriteSlow) {
    const toast = await toastController.create({ message: i18n.write_slow(), duration: 6000, position: 'bottom', color: 'medium' });
    await toast.present();
    return;
  }
  const message = !(error instanceof JournalWriteRefused) ? i18n.error_generic()
    : error.reason === 'noAuthor' ? i18n.error_no_author()
    : error.reason === 'othersContent' ? i18n.error_others_content()
    : error.reason === 'outdated' ? i18n.error_outdated()
    : error.reason === 'offline' ? i18n.error_offline()
    : i18n.error_not_owner();
  const toast = await toastController.create({ message, duration: 4000, position: 'bottom', color: 'warning' });
  await toast.present();
}

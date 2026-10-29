import { ToastController } from '@ionic/angular';
import { JournalI18n, JournalWriteRefused } from '@okr/travel-journal-util';

/** Shows why a journal action failed: no bound author, someone else's block, or anything else. */
export async function showJournalError(toastController: ToastController, i18n: JournalI18n, error: unknown): Promise<void> {
  const message = !(error instanceof JournalWriteRefused) ? i18n.error_generic()
    : error.reason === 'noAuthor' ? i18n.error_no_author()
    : error.reason === 'othersContent' ? i18n.error_others_content()
    : error.reason === 'outdated' ? i18n.error_outdated()
    : i18n.error_not_owner();
  const toast = await toastController.create({ message, duration: 4000, position: 'bottom', color: 'warning' });
  await toast.present();
}

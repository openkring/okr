import { ActionSheetController } from '@ionic/angular';

import { JOURNAL_PHOTO_MODES, JournalI18n, JournalPhotoMode } from '@okr/travel-journal-util';

import { photoModeLabel } from './journal-sync-line';

/** Lets the user pick how photos move through Firebase (all / upload only / paused). */
export async function choosePhotoMode(
  actionSheetController: ActionSheetController, i18n: JournalI18n, current: JournalPhotoMode, apply: (mode: JournalPhotoMode) => Promise<void>,
): Promise<void> {
  const sheet = await actionSheetController.create({
    header: i18n.photo_mode_title(),
    buttons: [
      ...JOURNAL_PHOTO_MODES.map((mode) => ({
        text: `${mode === current ? '✓ ' : ''}${photoModeLabel(i18n, mode)}`,
        handler: () => void apply(mode),
      })),
      { text: i18n.cancel(), role: 'cancel' },
    ],
  });
  await sheet.present();
}

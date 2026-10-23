import { ModalController } from '@ionic/angular';

import { JournalInfoModal } from '@okr/travel-journal-ui';

/** Opens the explanation of the journal's offline and photo workflow. */
export async function openJournalInfo(modalController: ModalController): Promise<void> {
  const modal = await modalController.create({ component: JournalInfoModal });
  await modal.present();
}

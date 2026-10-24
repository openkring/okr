import { ModalController } from '@ionic/angular';

import { JournalFlyover } from '@okr/travel-journal-ui';
import { FlyTimeline, JournalI18n, JournalTileSource } from '@okr/travel-journal-util';

/** Opens the flyover full screen over the current page; it closes itself at the end (flyover design 2026-10-24). */
export async function openJournalFlyover(modalController: ModalController, timeline: FlyTimeline, tiles: JournalTileSource[], i18n: JournalI18n): Promise<void> {
  const modal = await modalController.create({ component: JournalFlyover, componentProps: { timeline, tiles, i18n }, cssClass: 'fullscreen-modal' });
  await modal.present();
}

import { PopoverController } from '@ionic/angular';

import { JournalContextMenu } from '@okr/travel-journal-ui';
import { JournalI18n, JournalMenuAction, JournalMenuItem } from '@okr/travel-journal-util';

/**
 * Opens a journal page's ⋮ menu at the tapped button and resolves with the chosen action (spec 1.126 §2).
 * Opened programmatically, not by `trigger`: the button appears only when the menu has entries.
 */
export async function openJournalMenu(
  popoverController: PopoverController, event: Event, items: JournalMenuItem[], i18n: JournalI18n,
): Promise<JournalMenuAction | undefined> {
  const popover = await popoverController.create({
    component: JournalContextMenu, componentProps: { items, i18n }, event, showBackdrop: true, dismissOnSelect: true,
  });
  await popover.present();
  const { data } = await popover.onDidDismiss<JournalMenuAction>();
  return items.some((i) => i.action !== 'divider' && i.action === data) ? data : undefined;
}

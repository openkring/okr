import { inject, Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { SectionIconPicker } from '@okr/cms-section-util';
import { splitIconName } from '@okr/shared-util-core';

/**
 * The icon picker of the section edit modal: opens the icon selector of the icon collection
 * (`IconSelectModal`, loaded on demand) and resolves to the chosen icon name.
 */
@Injectable()
export class CmsSectionIconPicker implements SectionIconPicker {
  private readonly modalController = inject(ModalController);

  /** opens on the set of the current icon; the result carries its set (`filetypes:pdf`) unless it is a default icon */
  public async pick(current?: string): Promise<string | undefined> {
    const { IconSelectModal } = await import('@okr/cms-icon-feature');
    const modal = await this.modalController.create({
      component: IconSelectModal,
      componentProps: { initialDir: current ? splitIconName(current).set : 'icons' },
      cssClass: ['modal-narrow', 'modal-fixed-height'],
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    return role === 'confirm' && typeof data === 'string' && data ? data : undefined;
  }
}

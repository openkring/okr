import { Component, computed, inject, input } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { NewsSegment } from '@okr/shared-models';
import { NewsDetailModal } from '@okr/social-news-center-ui';
import { ORG_EDIT_MODAL } from '@okr/subject-org-ui';
import { NewsItem } from '@okr/social-news-center-util';

import { NewsCenterStore } from './news-center.store';

/**
 * Host of `okr-news-detail-modal`, opened by `NewsCenterStore.openItem`. ModalController
 * componentProps are a one-time snapshot, so a webcam opened full size would freeze on the image
 * it was opened with. This host injects the store (passed in through the modal's `injector`) and
 * binds the camera's current item, so the open modal follows the store's `refreshMinutes` timer.
 * Not an edit modal: nothing to save, no change-confirmation.
 */
@Component({
  selector: 'okr-news-center-detail-modal',
  standalone: true,
  imports: [NewsDetailModal],
  template: `
    <okr-news-detail-modal class="ion-page" [item]="current()" [channel]="channel()" [segment]="segment()" [i18n]="store.i18n"
      [imageUrl]="imageUrl()" [capturedAt]="capturedAt()" [openOrg]="openOrg()" />
  `,
})
export class NewsCenterDetailModal {
  protected readonly store = inject(NewsCenterStore);
  private readonly modalController = inject(ModalController);
  private readonly orgEditModal = inject(ORG_EDIT_MODAL, { optional: true });

  public readonly item = input.required<NewsItem>();
  public readonly segment = input<NewsSegment>('video');

  /** a webcam's newest image from the store; every other item as opened */
  protected readonly current = computed(() => {
    const item = this.item();
    if (this.segment() !== 'webcam') return item;
    return this.store.feeds()[item.channelKey]?.items[0] ?? item;
  });
  protected readonly channel = computed(() => this.store.allChannels().find((c) => c.okey === this.item().channelKey));
  protected readonly imageUrl = computed(() => (this.segment() === 'webcam' ? (this.current().mediaUrl ?? '') : ''));
  /** icon-only link to the camera's host org, read-only — only when it has one and this app provides the org modal */
  protected readonly openOrg = computed(() => {
    const orgKey = this.channel()?.orgKey;
    const loader = this.orgEditModal;
    if (!orgKey || !loader) return undefined;
    return async (): Promise<void> => {
      const org = this.store.appStore.allOrgs().find((o) => o.okey === orgKey);
      if (!org) return;
      const OrgEditModal = await loader();
      const modal = await this.modalController.create({
        component: OrgEditModal,
        componentProps: {
          org,
          currentUser: this.store.appStore.currentUser(),
          tagModel: 'org',
          tenantId: this.store.appStore.tenantId(),
          types: this.store.appStore.getCategory('org_type'),
          readOnly: true,
        },
      });
      await modal.present();
    };
  });
  protected readonly capturedAt = computed(() => {
    const at = this.current().publishedAt;
    return this.segment() === 'webcam' && at ? new Date(at) : null;
  });
}

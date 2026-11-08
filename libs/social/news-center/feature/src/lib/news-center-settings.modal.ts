import { Component, inject } from '@angular/core';

import { NewsSettingsModal } from '@okr/social-news-center-ui';

import { NewsCenterStore } from './news-center.store';

/**
 * Host of `okr-news-settings-modal`, opened by `NewsCenterStore.openSettings`. The settings modal
 * saves on every tap through outputs and must show the result at once (a hidden channel moves to
 * «ausgeblendet», a resolved link shows its preview). A modal opened through ModalController can
 * neither listen to outputs nor receive new inputs, so this host injects the store (passed in
 * through the modal's `injector`) and binds both directions live.
 */
@Component({
  selector: 'okr-news-center-settings-modal',
  standalone: true,
  imports: [NewsSettingsModal],
  template: `
    <okr-news-settings-modal class="ion-page"
      [segment]="store.segment()" [isCurator]="store.isCurator()" [i18n]="store.i18n"
      [mine]="store.channels()" [hidden]="store.hiddenChannels()" [optional]="store.optionalChannels()" [club]="store.clubChannels()"
      [myRequests]="store.myRequests()" [openRequests]="store.openRequests()" [canSuggest]="store.canSuggest()"
      [resolved]="store.resolved()" [preview]="store.preview()" [resolveError]="store.resolveError()"
      (hide)="store.hide($event)" (show)="store.show($event)" (add)="store.add($event)" (resetDefaults)="store.reset()"
      (suggest)="store.suggest($event)" (resolve)="store.resolve($event)"
      (clubSave)="store.clubSave($event)" (accept)="store.accept($event)" (reject)="store.reject($event)"
      (clubArchive)="store.clubArchive($event)" (clubReorder)="store.clubReorder($event)" />
  `,
})
export class NewsCenterSettingsModal {
  protected readonly store = inject(NewsCenterStore);
}

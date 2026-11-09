import { Component, input, output } from '@angular/core';
import { IonContent, IonModal } from '@ionic/angular';

import { NewsChannelModel } from '@okr/shared-models';
import { NewsCenterI18n } from '@okr/social-news-center-util';

import { NewsChannelList } from './news-channel-list';

/**
 * Phone variant of the channel list: the same list in a bottom sheet (breakpoints 0 / 0.6 / 1).
 * The parent owns `open`; a choice emits `selected` and `closed` (the parent flips `open` to false).
 */
@Component({
  selector: 'okr-news-channel-sheet',
  standalone: true,
  imports: [IonModal, IonContent, NewsChannelList],
  template: `
    <ion-modal [isOpen]="open()" [breakpoints]="[0, 0.6, 1]" [initialBreakpoint]="0.6" (didDismiss)="closed.emit()">
      <ng-template>
        <ion-content>
          <okr-news-channel-list
            [channels]="channels()" [selectedKey]="selectedKey()" [failedKeys]="failedKeys()" [avatars]="avatars()" [showMapEntry]="showMapEntry()" [i18n]="i18n()"
            (selected)="onSelected($event)" />
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
})
export class NewsChannelSheet {
  public readonly open = input(false);
  public readonly channels = input.required<NewsChannelModel[]>();
  public readonly selectedKey = input<string>('all');
  public readonly failedKeys = input<string[]>([]);
  public readonly avatars = input<Record<string, string>>({});
  public readonly showMapEntry = input(false);
  public readonly i18n = input.required<NewsCenterI18n>();

  public readonly selected = output<string>();
  public readonly closed = output<void>();

  protected onSelected(key: string): void {
    this.selected.emit(key);
    this.closed.emit();
  }
}

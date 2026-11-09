import { Component, input, output } from '@angular/core';
import { IonAvatar, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';

import { NewsChannelModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ImgDirective } from '@okr/shared-ui';
import { NewsCenterI18n } from '@okr/social-news-center-util';

import { NewsImagePipe } from './news-image.pipe';

/** Channel column of the NewsCenter page: «Alle Kanäle» on top, then one row per channel. */
@Component({
  selector: 'okr-news-channel-list',
  standalone: true,
  imports: [NewsImagePipe, IonList, IonItem, IonAvatar, IonLabel, IonIcon, SvgIconPipe, ImgDirective],
  styles: [`
    ion-item.selected { --background: var(--ion-color-light); font-weight: 600; }
    .initial { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
      background: var(--ion-color-medium-tint); color: #fff; font-weight: 600; }
  `],
  template: `
    <ion-list lines="none">
      <ion-item button detail="false" [class.selected]="selectedKey() === 'all'" (click)="selected.emit('all')">
        <ion-label>{{ i18n().all_channels() }}</ion-label>
      </ion-item>
      @for (channel of channels(); track channel.okey) {
        <ion-item button detail="false" [class.selected]="selectedKey() === channel.okey" (click)="selected.emit(channel.okey)">
          <ion-avatar slot="start">
            @if (avatars()[channel.okey]; as avatar) {
              <img okrImg [src]="avatar | newsImage" alt="" referrerpolicy="no-referrer" />
            } @else {
              <div class="initial">{{ channel.name.charAt(0) }}</div>
            }
          </ion-avatar>
          <ion-label>{{ channel.name }}</ion-label>
          @if (failedKeys().includes(channel.okey)) {
            <ion-icon slot="end" color="warning" src="{{ 'warning' | svgIcon }}" [attr.aria-label]="i18n().load_error()" />
          }
        </ion-item>
      }
    </ion-list>
  `,
})
export class NewsChannelList {
  public readonly channels = input.required<NewsChannelModel[]>();
  public readonly selectedKey = input<string>('all');
  public readonly failedKeys = input<string[]>([]);
  /** okey → avatar url (explicit avatarUrl or a webcam's current still), from `NewsCenterStore.avatars` */
  public readonly avatars = input<Record<string, string>>({});
  public readonly i18n = input.required<NewsCenterI18n>();

  public readonly selected = output<string>();
}

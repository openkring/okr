import { Component, input, output, signal } from '@angular/core';
import { IonAvatar, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';

import { NewsChannelModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ImgDirective } from '@okr/shared-ui';
import { NEWS_MAP_KEY, NewsCenterI18n } from '@okr/social-news-center-util';

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
      @if (showMapEntry()) {
        <ion-item button detail="false" [class.selected]="selectedKey() === mapKey" (click)="selected.emit(mapKey)">
          <ion-icon slot="start" src="{{ 'map' | svgIcon }}" />
          <ion-label>{{ i18n().map_overview() }}</ion-label>
        </ion-item>
      }
      <ion-item button detail="false" [class.selected]="selectedKey() === 'all'" (click)="selected.emit('all')">
        <ion-label>{{ i18n().all_channels() }}</ion-label>
      </ion-item>
      @for (channel of channels(); track channel.okey) {
        <ion-item button detail="false" [class.selected]="selectedKey() === channel.okey" (click)="selected.emit(channel.okey)">
          <ion-avatar slot="start">
            @if (avatarOk(channel.okey); as avatar) {
              <img okrImg [src]="avatar | newsImage" alt="" referrerpolicy="no-referrer" (error)="onAvatarError(avatar)" />
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
  /** webcam tab: show «Kartenübersicht» above «Alle Kanäle» */
  public readonly showMapEntry = input(false);

  protected readonly mapKey = NEWS_MAP_KEY;

  /** avatar URLs that failed to load (a camera that is down): they show the initial; a new still URL gets a fresh chance */
  protected readonly failedAvatars = signal<ReadonlySet<string>>(new Set());
  protected onAvatarError(url: string): void {
    this.failedAvatars.update((s) => new Set(s).add(url));
  }
  protected avatarOk(okey: string): string {
    const url = this.avatars()[okey] ?? '';
    return url && !this.failedAvatars().has(url) ? url : '';
  }
  public readonly i18n = input.required<NewsCenterI18n>();

  public readonly selected = output<string>();
}

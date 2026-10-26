import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { formatClockTime, type TrackerI18n } from '@okr/mobility-tracker-util';
import { SvgIconPipe } from '@okr/shared-pipes';

/** One photo of the strip: `src` is a displayable URL (local file or data URL); without one a placeholder shows. */
export interface TrackPhotoItem { src?: string; hidden: boolean; takenAt: string }
export interface TrackPhotoToggle { index: number; hidden: boolean }

/**
 * The photos of a track as a horizontal strip, in time order. Hidden photos stay in the strip, dimmed and marked
 * «Ausgeblendet»; each photo has a button to hide or show it again (`photoToggle` emits the wanted state).
 */
@Component({
  selector: 'okr-track-photos',
  imports: [IonButton, IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; }
    .strip { display: flex; gap: 12px; overflow-x: auto; padding: 8px 16px 12px; scroll-snap-type: x proximity; }
    .photo { flex: 0 0 auto; width: 120px; display: flex; flex-direction: column; align-items: center; scroll-snap-align: start; }
    .frame { position: relative; width: 120px; height: 120px; border-radius: 8px; overflow: hidden;
      background: var(--ion-color-light, #eef2f4); display: flex; align-items: center; justify-content: center; }
    .frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .frame ion-icon { font-size: 32px; color: var(--ion-color-medium, #8a9399); }
    .photo.hidden .frame img, .photo.hidden .frame ion-icon { opacity: .35; }
    .badge { position: absolute; left: 6px; bottom: 6px; padding: 2px 6px; border-radius: 4px; font-size: 12px;
      background: rgba(0, 0, 0, .6); color: #fff; }
    .time { font-size: 13px; color: var(--ion-color-medium, #8a9399); margin-top: 4px; }
  `],
  template: `
    <div class="strip">
      @for (photo of photos(); track $index; let i = $index) {
        <div class="photo" [class.hidden]="photo.hidden">
          <div class="frame">
            @if (photo.src) {
              <img [src]="photo.src" alt="" loading="lazy" />
            } @else {
              <ion-icon src="{{ 'camera' | svgIcon }}" aria-hidden="true" />
            }
            @if (photo.hidden) {
              <span class="badge">{{ i18n().photos_hidden() }}</span>
            }
          </div>
          <span class="time">{{ time(photo.takenAt) }}</span>
          @if (!readonly()) {
            <ion-button fill="clear" size="small" (click)="photoToggle.emit({ index: i, hidden: !photo.hidden })"
              [attr.aria-label]="ariaLabel(photo)">
              <ion-icon slot="start" src="{{ (photo.hidden ? 'eye-on' : 'eye-off') | svgIcon }}" />
              {{ photo.hidden ? i18n().photos_show() : i18n().photos_hide() }}
            </ion-button>
          }
        </div>
      }
    </div>
  `,
})
export class TrackPhotos {
  public readonly photos = input<TrackPhotoItem[]>([]);
  public readonly i18n = input.required<TrackerI18n>();
  /** true = no hide / show buttons: the diary's read-only track view */
  public readonly readonly = input(false);

  public readonly photoToggle = output<TrackPhotoToggle>();

  protected time(takenAt: string): string {
    return formatClockTime(takenAt);
  }

  protected ariaLabel(photo: TrackPhotoItem): string {
    const label = photo.hidden ? this.i18n().photos_show_aria() : this.i18n().photos_hide_aria();
    return label.replace('{time}', formatClockTime(photo.takenAt));
  }
}

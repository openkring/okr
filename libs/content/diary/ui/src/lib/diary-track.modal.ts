import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { AlertController, IonContent, IonIcon, ModalController } from '@ionic/angular';

import {
  DiaryI18n, DiaryTrackCard, diaryTrackModeLabel, formatTrackDate, toStretchTiles, trackTotals,
} from '@okr/content-diary-util';
import { formatClockTime } from '@okr/mobility-tracker-util';
import { TrackMap, TrackMapPhoto, TrackMapSection } from '@okr/mobility-tracker-ui';
import { IMAGE_STYLE_SHAPE, ImageConfig, ImageType } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, showImageSlider } from '@okr/shared-ui';
import { okrPrompt } from '@okr/shared-util-angular';

/** a visible photo of the grid; `index` points into the map's `photos` (hidden ones included there) */
interface DiaryTrackPhotoCard { index: number; time: string; src?: string; ariaLabel: string }

/**
 * Read-only view of one recorded track from the diary day (spec 1.121 §7), laid out map-first: the title in the
 * toolbar (its edit button renames the track), the date with its weekday and a totals line, the map (coloured
 * sections, start / end dots, photo pins fanned out where they share a place), one tile per stretch (time,
 * distance, speed, steps when measured), the visible photos as a grid and the map credit. A tap on a photo — pin or
 * grid — opens the full-screen slider over all visible photos of the track. Hidden photos never appear. The title is
 * the only thing changed here (a prompt, no form); corrections stay on the tracker's own page.
 * The map is kept well below the viewport height and ignores the mouse wheel, so the page scrolls past it.
 * Thumbnails come in through `loadThumb` (the store's TrackService.readThumb) — this ui modal injects no service.
 */
@Component({
  selector: 'okr-diary-track-modal',
  standalone: true,
  imports: [Header, TrackMap, IonContent, IonIcon, SvgIconPipe],
  styles: [`
    :host {
      --okr-dt-surface: var(--ion-card-background, var(--ion-item-background, var(--ion-background-color, #fff)));
      --okr-dt-line: var(--ion-border-color, var(--ion-color-step-150, #d7ddd8));
      --okr-dt-muted: var(--ion-color-medium, #5d6a63);
      --okr-dt-fg: var(--ion-text-color, #1d2420);
      --okr-dt-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 40px; display: grid; gap: 20px; }
    header { display: grid; gap: 6px; }
    .date { font-weight: 600; font-size: 18px; margin: 0; }
    .totals { display: flex; flex-wrap: wrap; gap: 4px 20px; font-family: var(--okr-dt-mono); font-size: 13px;
      color: var(--okr-dt-muted); font-variant-numeric: tabular-nums; }
    .totals b { color: var(--okr-dt-fg); font-weight: 400; }
    okr-track-map { --okr-track-map-height: max(220px, min(42vh, 420px)); border-radius: 10px;
      border: 1px solid var(--okr-dt-line); }
    .stretches { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 12px; }
    .stretch { background: var(--okr-dt-surface); border: 1px solid var(--okr-dt-line); border-left: 4px solid var(--c);
      border-radius: 10px; padding: 14px 16px; display: grid; gap: 6px; }
    .stretch h2 { font-weight: 600; font-size: 19px; margin: 0; display: flex; align-items: center; gap: 8px; }
    .stretch h2 ion-icon { font-size: 22px; color: var(--c); flex: 0 0 auto; }
    .stretch dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 12px; margin: 0; }
    .stretch dl.four { grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); }
    .stretch dt { font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--okr-dt-muted); }
    .stretch dd { margin: 0; font-family: var(--okr-dt-mono); font-size: 15px; font-variant-numeric: tabular-nums; }
    h3 { font-weight: 600; font-size: 19px; margin: 0; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr)); gap: 12px; }
    .photo { all: unset; cursor: pointer; display: grid; gap: 6px; background: var(--okr-dt-surface);
      border: 1px solid var(--okr-dt-line); border-radius: 10px; overflow: hidden; padding-bottom: 10px; }
    .photo:focus-visible { outline: 2px solid var(--ion-color-primary, #0f6e63); outline-offset: 2px; }
    .frame { aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center;
      background: var(--ion-color-step-100, #eef2f4); }
    .frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .frame ion-icon { font-size: 32px; color: var(--okr-dt-muted); }
    .photo small { padding-inline: 10px; color: var(--okr-dt-muted); font-family: var(--okr-dt-mono); font-size: 12px;
      font-variant-numeric: tabular-nums; }
    .note { color: var(--okr-dt-muted); font-size: 13px; margin: 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: name() }" [isModal]="true" actionIcon="edit" [actionTitle]="i18n().track_view_rename()" (actionClicked)="rename()" />
    <ion-content>
      <div class="wrap">
        <header>
          @if (dateLabel()) {
            <p class="date">{{ dateLabel() }}</p>
          }
          <div class="totals">
            <span><b>{{ totals().distance }}</b> {{ i18n().track_view_total() }}</span>
            <span><b>{{ totals().points }}</b> {{ i18n().track_view_points() }}</span>
            @if (totals().timeRange) {
              <span><b>{{ totals().timeRange }}</b></span>
            }
            <span><b>{{ totals().photos }}</b> {{ i18n().track_view_photos() }}</span>
          </div>
        </header>

        <okr-track-map role="region" [attr.aria-label]="i18n().track_view_map_label()"
          [sections]="mapSections()" [photos]="mapPhotos()" [live]="false" [photosClickable]="true" [wheelZoom]="false"
          (photoClicked)="openSlider($event)" />

        @if (tiles().length > 0) {
          <div class="stretches">
            @for (tile of tiles(); track $index) {
              <section class="stretch" [style.--c]="tile.color">
                <h2><ion-icon src="{{ tile.icon | svgIcon }}" aria-hidden="true" />{{ modeLabel(tile.mode) }}</h2>
                <dl [class.four]="tile.steps !== undefined">
                  <div><dt>{{ i18n().track_view_time() }}</dt><dd>{{ tile.timeRange || '–' }}</dd></div>
                  <div><dt>{{ i18n().track_view_distance() }}</dt><dd>{{ tile.distance }}</dd></div>
                  <div><dt>{{ i18n().track_view_speed() }}</dt><dd>{{ tile.speed }}</dd></div>
                  @if (tile.steps !== undefined) {
                    <div><dt>{{ i18n().track_view_steps() }}</dt><dd>{{ tile.steps }}</dd></div>
                  }
                </dl>
              </section>
            }
          </div>
        }

        @if (photoCards().length > 0) {
          <h3>{{ i18n().track_view_photos_title() }}</h3>
          <div class="photos">
            @for (photo of photoCards(); track photo.index) {
              <button type="button" class="photo" [attr.aria-label]="photo.ariaLabel" (click)="openSlider(photo.index)">
                <div class="frame">
                  @if (photo.src) {
                    <img [src]="photo.src" alt="" loading="lazy" />
                  } @else {
                    <ion-icon src="{{ 'camera' | svgIcon }}" aria-hidden="true" />
                  }
                </div>
                <small>{{ photo.time }}</small>
              </button>
            }
          </div>
        }

        <p class="note">{{ i18n().track_view_map_note() }}</p>
      </div>
    </ion-content>
  `,
})
export class DiaryTrackModal {
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);

  public readonly card = input.required<DiaryTrackCard>();
  public readonly i18n = input.required<DiaryI18n>();
  /** a thumbnail (private bucket) as a displayable URL — the store caches per path */
  public readonly loadThumb = input.required<(thumbPath: string) => Promise<string>>();
  /** saves a new title of the track; resolves false when the write failed */
  public readonly renameTrack = input.required<(card: DiaryTrackCard, name: string) => Promise<boolean>>();
  /** the active UI language — weekday and month name of the date */
  public readonly lang = input('de');

  /** displayable picture per thumbPath, filled asynchronously; a failed read leaves the placeholder */
  private readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());
  /** the title on screen — the card's name until it is renamed here */
  protected readonly name = linkedSignal(() => this.card().name);
  private readonly sliderBusy = signal(false);

  protected readonly dateLabel = computed(() => formatTrackDate(this.card().startDate, this.lang()));
  protected readonly totals = computed(() => trackTotals(this.card(), this.lang()));
  protected readonly tiles = computed(() => toStretchTiles(this.card(), this.lang()));
  protected readonly mapSections = computed<TrackMapSection[]>(() => this.card().sections);
  protected readonly mapPhotos = computed<TrackMapPhoto[]>(() => {
    const thumbs = this.thumbs();
    return this.card().photos.map(p => ({ lat: p.lat, lng: p.lng, hidden: p.hidden, src: p.thumbPath ? thumbs.get(p.thumbPath) : undefined }));
  });
  /** hidden photos are left out of the diary entirely (the owner hid them) */
  protected readonly photoCards = computed<DiaryTrackPhotoCard[]>(() => {
    const thumbs = this.thumbs();
    const label = this.i18n().track_view_photo_show();
    const cards: DiaryTrackPhotoCard[] = [];
    this.card().photos.forEach((p, index) => {
      if (p.hidden) return;
      const time = formatClockTime(p.takenAt);
      cards.push({ index, time, src: p.thumbPath ? thumbs.get(p.thumbPath) : undefined, ariaLabel: label.replace('{time}', time) });
    });
    return cards;
  });

  constructor() {
    effect(() => {
      const load = this.loadThumb();
      for (const photo of this.card().photos) {
        const path = photo.thumbPath;
        if (!path || photo.hidden) continue;
        load(path)
          .then(src => this.thumbs.update(m => new Map(m).set(path, src)))
          .catch(() => { /* placeholder stays */ });
      }
    });
  }

  protected modeLabel(mode: DiaryTrackCard['modes'][number]): string {
    return diaryTrackModeLabel(this.i18n(), mode);
  }

  /**
   * Full-screen slider over the visible photos of the track that have a picture, starting at the tapped one
   * (`index` into the track's photos). The slider takes its URLs up front, so a thumbnail still on its way is
   * awaited first; there is no larger rendition than the thumbnail.
   */
  protected async openSlider(index: number): Promise<void> {
    if (this.sliderBusy()) return;
    this.sliderBusy.set(true);
    try {
      const photos = this.card().photos.map((p, i) => ({ p, i })).filter(({ p }) => !p.hidden && !!p.thumbPath);
      const known = this.thumbs();
      const urls = await Promise.all(photos.map(({ p }) => known.get(p.thumbPath ?? '') ?? this.loadThumb()(p.thumbPath ?? '').catch(() => '')));
      const images: ImageConfig[] = [];
      let startIndex = 0;
      photos.forEach(({ p, i }, k) => {
        if (!urls[k]) return;
        if (i === index) startIndex = images.length;
        const label = formatClockTime(p.takenAt);
        images.push({ label, type: ImageType.Image, url: urls[k], actionUrl: '', altText: label, overlay: '' });
      });
      if (images.length) await showImageSlider(this.modalController, images, { ...IMAGE_STYLE_SHAPE }, startIndex);
    } finally {
      this.sliderBusy.set(false);
    }
  }

  /** Renames the track; the title changes only once the write succeeded. */
  protected async rename(): Promise<void> {
    const i18n = this.i18n();
    const current = this.name();
    const entered = await okrPrompt(this.alertController, i18n.track_view_rename(), i18n.track_view_rename_prompt(), i18n.save(), i18n.cancel(), current);
    const name = entered?.trim();
    if (!name || name === current) return;
    if (await this.renameTrack()(this.card(), name)) this.name.set(name);
  }
}

import { Component, computed, effect, ElementRef, input, signal, viewChild } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';

import {
  DiaryI18n, DiaryTrackCard, diaryTrackModeLabel, formatTrackDate, toStretchTiles, trackTotals,
} from '@okr/content-diary-util';
import { formatClockTime } from '@okr/mobility-tracker-util';
import { TrackMap, TrackMapPhoto, TrackMapSection } from '@okr/mobility-tracker-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';

/** a visible photo of the grid; `index` points into the map's `photos` (hidden ones included there) */
interface DiaryTrackPhotoCard { index: number; time: string; src?: string; ariaLabel: string }

/**
 * Read-only view of one recorded track from the diary day (spec 1.121 §7), laid out map-first: title, date and a
 * totals line, the large map (coloured sections, start / end dots, photo pins), one tile per stretch (time,
 * distance, speed, steps when measured), the visible photos as a grid — a tap pans the map to that photo's pin and
 * enlarges it — and the map credit. Hidden photos never appear. Nothing is edited here, so there is no
 * change-confirmation; corrections stay on the tracker's own page.
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
    header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; }
    h1 { font-weight: 700; font-size: clamp(26px, 5vw, 36px); line-height: 1.1; margin: 0; text-wrap: balance; }
    .sub { color: var(--okr-dt-muted); margin: 4px 0 0; }
    .totals { display: flex; flex-wrap: wrap; gap: 4px 20px; font-family: var(--okr-dt-mono); font-size: 13px;
      color: var(--okr-dt-muted); font-variant-numeric: tabular-nums; }
    .totals b { color: var(--okr-dt-fg); font-weight: 400; }
    okr-track-map { --okr-track-map-height: max(320px, min(62vh, 560px)); border-radius: 10px;
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
    .photo.active { border-color: var(--okr-dt-fg); box-shadow: 0 0 0 1px var(--okr-dt-fg); }
    .frame { aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center;
      background: var(--ion-color-step-100, #eef2f4); }
    .frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .frame ion-icon { font-size: 32px; color: var(--okr-dt-muted); }
    .photo small { padding-inline: 10px; color: var(--okr-dt-muted); font-family: var(--okr-dt-mono); font-size: 12px;
      font-variant-numeric: tabular-nums; }
    .note { color: var(--okr-dt-muted); font-size: 13px; margin: 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: card().name }" [isModal]="true" />
    <ion-content>
      <div class="wrap">
        <header>
          <div>
            <h1>{{ card().name }}</h1>
            @if (dateLabel()) {
              <p class="sub">{{ dateLabel() }}</p>
            }
          </div>
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
          [sections]="mapSections()" [photos]="mapPhotos()" [selectedPhoto]="selected()" [live]="false" />

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
              <button type="button" class="photo" [class.active]="selected() === photo.index"
                [attr.aria-pressed]="selected() === photo.index" [attr.aria-label]="photo.ariaLabel" (click)="select(photo.index)">
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
  public readonly card = input.required<DiaryTrackCard>();
  public readonly i18n = input.required<DiaryI18n>();
  /** a thumbnail (private bucket) as a displayable URL — the store caches per path */
  public readonly loadThumb = input.required<(thumbPath: string) => Promise<string>>();
  /** the active UI language — month name of the date */
  public readonly lang = input('de');

  /** displayable picture per thumbPath, filled asynchronously; a failed read leaves the placeholder */
  private readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());
  /** index into `mapPhotos` of the photo shown on the map; undefined = none */
  protected readonly selected = signal<number | undefined>(undefined);
  private readonly mapRef = viewChild(TrackMap, { read: ElementRef });

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
   * A tap shows the photo on the map; the highlight stays until another photo is tapped. Tapping the selected photo
   * again re-centres the map on it: the map pans on a change of `selectedPhoto` only, so the selection is cleared for
   * one render and then set again.
   */
  protected select(index: number): void {
    if (this.selected() === index) {
      this.selected.set(undefined);
      setTimeout(() => this.selected.set(index));
    } else {
      this.selected.set(index);
    }
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    (this.mapRef()?.nativeElement as HTMLElement | undefined)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }
}

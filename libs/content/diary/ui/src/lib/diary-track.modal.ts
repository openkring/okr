import { Component, computed, effect, input, signal } from '@angular/core';
import { IonContent, IonLabel, IonListHeader } from '@ionic/angular';

import { DiaryI18n, DiaryTrackCard } from '@okr/content-diary-util';
import { summarize } from '@okr/mobility-tracker-util';
import { TrackMap, TrackMapPhoto, TrackMapSection, TrackPhotoItem, TrackPhotos, TrackSectionRow, TrackSections } from '@okr/mobility-tracker-ui';
import { Header } from '@okr/shared-ui';

import { diaryTrackerI18n } from './diary-track-i18n';

/**
 * Read-only view of one recorded track from the diary day (spec 1.121 §7): a large map with the visible photos as
 * pins, the sections (mode, distance, duration — no corrections) and the photo strip (no hide / show).
 * Nothing is edited here, so there is no change-confirmation; corrections stay on the tracker's own page.
 * Thumbnails come in through `loadThumb` (the store's TrackService.readThumb) — this ui modal injects no service.
 */
@Component({
  selector: 'okr-diary-track-modal',
  standalone: true,
  imports: [Header, TrackMap, TrackSections, TrackPhotos, IonContent, IonListHeader, IonLabel],
  template: `
    <okr-header [i18n]="{ title: card().name }" [isModal]="true" />
    <ion-content>
      <okr-track-map [sections]="mapSections()" [photos]="mapPhotos()" [live]="false" />
      @if (photoItems().length > 0) {
        <ion-list-header><ion-label>{{ i18n().track_photos() }}</ion-label></ion-list-header>
        <okr-track-photos [photos]="photoItems()" [i18n]="trackI18n()" [readonly]="true" />
      }
      <ion-list-header><ion-label>{{ i18n().track_sections() }}</ion-label></ion-list-header>
      <okr-track-sections [sections]="rows()" [i18n]="trackI18n()" [readonly]="true" />
    </ion-content>
  `,
})
export class DiaryTrackModal {
  public readonly card = input.required<DiaryTrackCard>();
  public readonly i18n = input.required<DiaryI18n>();
  /** a thumbnail (private bucket) as a displayable URL — the store caches per path */
  public readonly loadThumb = input.required<(thumbPath: string) => Promise<string>>();

  /** displayable picture per thumbPath, filled asynchronously; a failed read leaves the placeholder */
  private readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());

  /** the tracker components' labels, built from the diary scope */
  protected readonly trackI18n = computed(() => diaryTrackerI18n(this.i18n()));
  protected readonly mapSections = computed<TrackMapSection[]>(() => this.card().sections);
  protected readonly rows = computed<TrackSectionRow[]>(() =>
    this.card().sections.map(s => ({
      mode: s.mode, detected: false, ...summarize(s.points), steps: s.steps, splitAvgS: s.splitAvgS, splitBestS: s.splitBestS,
      strokes: s.strokes, strokeRateAvg: s.strokeRateAvg, strokeRateMax: s.strokeRateMax,
      distancePerStrokeM: s.strokes ? Math.round((summarize(s.points).distanceM / s.strokes) * 10) / 10 : undefined,
    })));
  protected readonly mapPhotos = computed<TrackMapPhoto[]>(() => {
    const thumbs = this.thumbs();
    return this.card().photos.map(p => ({ lat: p.lat, lng: p.lng, hidden: p.hidden, src: p.thumbPath ? thumbs.get(p.thumbPath) : undefined }));
  });
  /** hidden photos are left out of the diary entirely (the owner hid them) */
  protected readonly photoItems = computed<TrackPhotoItem[]>(() => {
    const thumbs = this.thumbs();
    return this.card().photos.filter(p => !p.hidden)
      .map(p => ({ takenAt: p.takenAt, hidden: false, src: p.thumbPath ? thumbs.get(p.thumbPath) : undefined }));
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
}

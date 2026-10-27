import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { IonAvatar, IonButton, IonButtons, IonChip, IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonProgressBar, IonToolbar, ModalController } from '@ionic/angular';
import { Browser } from '@capacitor/browser';

import { AvatarInfo, DiaryModel, IMAGE_STYLE_SHAPE } from '@okr/shared-models';
import { Header, ImgDirective, showImageSlider } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AvatarDisplay, AvatarPipe } from '@okr/avatar-ui';
import { weatherCodeToIcon, WEATHER_ICON_SET } from '@okr/weather-util';
import { dismissOverlay } from '@okr/shared-util-angular';
import { formatClockTime } from '@okr/mobility-tracker-util';

import {
  DiaryI18n, DiaryMediaResult, DiaryTrackCard, diaryTrackPhotoTiles, diaryAvatarName, diaryLocationAvatarKey, DIARY_TEXT_LOCATION_ICON, diaryLocationLabel, mainLocation, diarySliderImages, diaryWeatherLine, driveFolderUrl, formatDiaryDateLong, hasDiaryWeather,
  isDiaryVideo, JassDiaryResult, parseJassDiaryLine, renderDiaryHtml,
} from '@okr/content-diary-util';

import { DiaryJassCard } from './diary-jass-card';
import { DiaryMediaExtraTile, DiaryMediaRow } from './diary-media-row';
import { DiaryTrackCardView } from './diary-track-card';

/** Slider-size downloads in flight at once when the slider opens. */
const IMAGE_CONCURRENCY = 4;

/** The entries one step away from the shown one (spec 1.106 §2.1); undefined = no such entry. */
export interface DiaryNeighbours {
  prev?: DiaryModel;
  next?: DiaryModel;
  up?: DiaryModel;
}

/**
 * Read view of one diary entry. Pages in place through prev/next/up: `current` starts at the
 * `diary` input and is swapped by the nav buttons, so no modal is stacked per step. Everything
 * that needs the store or a feature lib (neighbour queries, person/location modals) comes IN as
 * a callback — this ui-lib modal must not inject the store back (store-modal-dynamic-import).
 */
@Component({
  selector: 'okr-diary-view-modal',
  standalone: true,
  imports: [Header, AvatarDisplay, AvatarPipe, ImgDirective, IonAvatar, DiaryMediaRow, DiaryJassCard, DiaryTrackCardView, SvgIconPipe, IonContent, IonListHeader, IonProgressBar, IonItem, IonLabel, IonList, IonNote, IonChip, IonIcon, IonButton, IonButtons, IonToolbar],
  styles: [`
    .body { padding: 16px; line-height: 1.5; }
    .meta ion-chip { margin-right: 4px; }
    .people { display: flex; flex-wrap: wrap; gap: 8px; }
    .person, .location { cursor: pointer; }
    .tracks { padding: 0 8px; }
    .when { display: flex; flex-wrap: wrap; align-items: center; column-gap: 4px; }
    .when h2 { margin: 0 4px 0 0; }
    /* the same chip as a person's (okr-avatar-display with showName) */
    .place { background-color: var(--ion-color-light); color: var(--ion-color-light-contrast); margin: 2px 0; }
    .place ion-avatar { width: 30px; height: 30px; }
  `],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" actionIcon="edit" [actionTitle]="i18n().edit()" (actionClicked)="edit()" />
    <ion-content>
      <ion-toolbar>
        <ion-buttons slot="start">
          @if (nav().prev) {
            <ion-button (click)="go(nav().prev)">
              <ion-icon slot="start" src="{{ 'chevron-back' | svgIcon }}" />{{ i18n().nav_prev() }}
            </ion-button>
          }
        </ion-buttons>
        @if (nav().up) {
          <ion-buttons class="ion-justify-content-center">
            <ion-button (click)="go(nav().up)">
              <ion-icon slot="start" src="{{ 'chevron-up' | svgIcon }}" />{{ i18n().nav_up() }}
            </ion-button>
          </ion-buttons>
        }
        <ion-buttons slot="end">
          @if (nav().next) {
            <ion-button (click)="go(nav().next)">
              {{ i18n().nav_next() }}<ion-icon slot="end" src="{{ 'chevron-forward' | svgIcon }}" />
            </ion-button>
          }
        </ion-buttons>
      </ion-toolbar>

      <ion-list lines="none" class="meta">
        <ion-item>
          <ion-label><h2>{{ dateLabel() }}</h2></ion-label>
          @if (current().scope === 'day' && hasWeather()) {
            <ion-icon slot="end" src="{{ weatherIcon() | svgIcon: weatherIconSet }}" />
            <ion-note slot="end">{{ weatherLine() }}</ion-note>
          } @else if (canRefreshWeather()) {
            <ion-button slot="end" fill="clear" size="small" [disabled]="weatherBusy()" (click)="fetchWeather()">
              <ion-icon slot="start" src="{{ 'reload' | svgIcon }}" />{{ i18n().weather_refresh() }}
            </ion-button>
          }
        </ion-item>
        @if (locations().length) {
          <ion-item>
            <!-- one wrapping line of location chips — the first chip is the main location -->
            <div class="when">
              @for (loc of locations(); track $index) {
                <ion-chip color="light" class="place" [class.location]="!!loc.key" [title]="locationName(loc)" (click)="tapLocation(loc)">
                  <ion-avatar>
                    <img okrImg src="{{ locationKey(loc) | avatar: locationIcon }}" [alt]="locationName(loc)" />
                  </ion-avatar>
                  <ion-label><small>{{ locationName(loc) }}</small></ion-label>
                </ion-chip>
              }
            </div>
          </ion-item>
        }
        @if (current().people.length) {
          <ion-item>
            <div class="people">
              @for (person of people(); track person[0].key) {
                <div class="person" (click)="openPerson()(person[0])">
                  <okr-avatar-display [avatars]="person" [showName]="true" />
                </div>
              }
              @for (label of freeTextPeople(); track $index) { <ion-chip color="medium">{{ label }}</ion-chip> }
            </div>
          </ion-item>
        }
        @if (events().length) {
          <ion-item>
            @for (e of events(); track e) { <ion-chip color="tertiary">{{ e }}</ion-chip> }
          </ion-item>
        }
      </ion-list>

      @for (jass of jassResults(); track $index) {
        <okr-diary-jass-card [result]="jass" [i18n]="i18n()" />
      }

      @if (current().scope === 'day' && tracks().length) {
        <ion-list-header><ion-label>{{ i18n().view_tracks() }}</ion-label></ion-list-header>
        <div class="tracks">
          @for (card of tracks(); track card.key) {
            <okr-diary-track-card [card]="card" [i18n]="i18n()" (open)="openTrack()($event)" />
          }
        </div>
      }

      @if (driveUrl() && sliderLoading()) { <ion-progress-bar type="indeterminate" /> }
      @if (driveUrl() && mediaFailed()) {
        <ion-note class="ion-padding-start">{{ i18n().media_load_failed() }}</ion-note>
      }
      @if (showImageRow()) {
        <!-- the Drive images, then the visible photos of the day's tracks -->
        <okr-diary-media-row kind="image" [files]="imageFiles()" [extras]="trackPhotoExtras()"
          (opened)="openImage($event)" (extraOpened)="openTrackPhoto($event)" />
      }
      @if (driveUrl()) {
        <ion-item lines="none" button [detail]="false" (click)="openDrive()">
          <ion-icon slot="start" src="{{ 'folder-open' | svgIcon }}" />
          <ion-label>{{ i18n().open_drive() }}</ion-label>
        </ion-item>
        <ion-item lines="none" button [detail]="false" [disabled]="media() === undefined && !mediaFailed()" (click)="reloadMedia()">
          <ion-icon slot="start" src="{{ 'reload' | svgIcon }}" />
          <ion-label>{{ i18n().media_reload() }}</ion-label>
        </ion-item>
      }

      <!-- markdown, sanitized by Angular; images are stripped (they live in Drive, decision 6) -->
      <div class="body" [innerHTML]="html().html"></div>

      @if (driveUrl() && media()?.documents?.length) {
        <okr-diary-media-row kind="document" [files]="media()?.documents" (opened)="openDocument($event)" />
      }

      @if (current().done.length) {
        <ion-list>
          <ion-item lines="none"><ion-label><strong>{{ i18n().view_done_title() }}</strong></ion-label></ion-item>
          @for (item of current().done; track $index) {
            <ion-item lines="none"><ion-icon slot="start" src="{{ 'checkmark' | svgIcon }}" /><ion-label class="ion-text-wrap">{{ item }}</ion-label></ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class DiaryViewModal {
  private readonly modalController = inject(ModalController);

  public readonly diary = input.required<DiaryModel>();
  public readonly i18n = input.required<DiaryI18n>();
  /** the active UI language — weekday names */
  public readonly lang = input.required<string>();
  public readonly neighbours = input.required<(d: DiaryModel) => Promise<DiaryNeighbours>>();
  public readonly openPerson = input.required<(a: AvatarInfo) => Promise<void>>();
  public readonly openLocation = input.required<(a: AvatarInfo) => Promise<void>>();
  /** the day folder's Drive files (spec 1.106 §2.3) — the store caches per entry */
  public readonly loadMedia = input.required<(d: DiaryModel, reload?: boolean) => Promise<DiaryMediaResult>>();
  /** one image of the day folder at slider size, as a `data:` URL — the store caches per file */
  public readonly loadImage = input.required<(d: DiaryModel, fileId: string) => Promise<string>>();
  /** fetches and saves the measured weather of a day; resolves to the saved entry, undefined = none */
  public readonly refreshWeather = input.required<(d: DiaryModel) => Promise<DiaryModel | undefined>>();
  /** the recorded tracks of a day (spec 1.121 §7); [] for other scopes, offline or without a person */
  public readonly loadTracks = input.required<(d: DiaryModel) => Promise<DiaryTrackCard[]>>();
  /** opens the read-only track view, optionally with one photo (index into the track's photos) shown on the map */
  public readonly openTrack = input.required<(card: DiaryTrackCard, photoIndex?: number) => Promise<void>>();
  /** a track photo's thumbnail (private bucket) as a displayable URL — the store's TrackService.readThumb */
  public readonly loadTrackThumb = input.required<(thumbPath: string) => Promise<string>>();

  /** the entry on screen — starts at `diary`, swapped by prev/next/up */
  protected readonly current = linkedSignal(() => this.diary());
  protected readonly nav = signal<DiaryNeighbours>({});
  /** undefined while loading */
  protected readonly media = signal<DiaryMediaResult | undefined>(undefined);
  protected readonly mediaFailed = signal(false);
  protected readonly sliderLoading = signal(false);
  protected readonly weatherBusy = signal(false);
  protected readonly tracks = signal<DiaryTrackCard[]>([]);
  /** displayable track photo per thumbPath, filled asynchronously; '' = read failed (placeholder) */
  private readonly trackThumbs = signal<ReadonlyMap<string, string>>(new Map());
  /** the visible photos of the day's tracks, after the Drive images */
  private readonly trackPhotos = computed(() => diaryTrackPhotoTiles(this.tracks()));
  protected readonly trackPhotoExtras = computed<DiaryMediaExtraTile[]>(() => {
    const thumbs = this.trackThumbs();
    const label = this.i18n().track_view_photo_show();
    return this.trackPhotos().map(t => ({
      key: t.key, src: (t.thumbPath && thumbs.get(t.thumbPath)) || undefined, loading: !!t.thumbPath && !thumbs.has(t.thumbPath), label: label.replace('{time}', formatClockTime(t.takenAt)),
    }));
  });
  /** Drive images (undefined = still loading); none without a folder or after a failed listing */
  protected readonly imageFiles = computed(() => (!this.driveUrl() || this.mediaFailed() ? [] : this.media()?.images));
  protected readonly showImageRow = computed(() => this.trackPhotos().length > 0
    || (!!this.driveUrl() && !this.mediaFailed() && (!this.media() || !!this.media()?.images?.length)));

  protected readonly title = computed(() => this.current().title || this.i18n().view_untitled());
  protected readonly dateLabel = computed(() => formatDiaryDateLong(this.current().date, this.lang()));
  /** every location in order — the first one is the main location */
  protected readonly locations = computed(() => this.current().locations ?? []);
  protected readonly locationName = diaryLocationLabel;
  protected readonly locationKey = diaryLocationAvatarKey;
  protected readonly locationIcon = DIARY_TEXT_LOCATION_ICON;
  /** one single-element array per person, so each avatar is its own tap target */
  protected readonly people = computed(() => (this.current().people ?? []).filter(p => !!p.key).map(p => [p]));
  /** persons without a key are plain text */
  protected readonly freeTextPeople = computed(() => (this.current().people ?? []).filter(p => !p.key).map(p => diaryAvatarName(p)));
  /** Jasstafel results are drawn as a card; every other event stays a chip */
  private readonly parsedEvents = computed(() => this.current().events.map(e => ({ e, jass: parseJassDiaryLine(e) })));
  protected readonly events = computed(() => this.parsedEvents().filter(p => !p.jass).map(p => p.e));
  protected readonly jassResults = computed(() => this.parsedEvents().map(p => p.jass).filter((j): j is JassDiaryResult => !!j));
  protected readonly html = computed(() => renderDiaryHtml(this.current().text));
  /**
   * A day entry created in the app has no `driveFolderId`; the function then looks the day folder
   * up and returns it with the listing (and writes it back, so the next stream emission carries it).
   * Kept in its own signal so the buttons do not blink away while «Neu laden» re-reads the folder.
   */
  private readonly resolvedFolderId = signal('');
  /** the entry `resolvedFolderId` belongs to — paging to another entry drops it */
  private readonly resolvedOkey = signal('');
  protected readonly driveUrl = computed(() => driveFolderUrl(this.current().driveFolderId || this.resolvedFolderId()));
  protected readonly hasWeather = computed(() => hasDiaryWeather(this.current().weather));
  protected readonly weatherLine = computed(() => diaryWeatherLine(this.current().weather));
  protected readonly weatherIcon = computed(() => weatherCodeToIcon(this.current().weather.code));
  protected readonly weatherIconSet = WEATHER_ICON_SET;
  /** weather needs a day and a resolved location (its coordinates); free text has none */
  protected readonly canRefreshWeather = computed(() => this.current().scope === 'day' && !!mainLocation(this.current())?.key);

  constructor() {
    // Neighbours of whatever is on screen. A slow answer for an entry the user already paged
    // away from is dropped (okey check), so the buttons never point from the wrong day.
    effect(() => {
      const shown = this.current();
      const load = this.neighbours();
      this.nav.set({});
      load(shown)
        .then(nav => { if (this.current().okey === shown.okey) this.nav.set(nav); })
        .catch(() => { /* no navigation is a usable fallback */ });
    });
    // The day's Drive files, same stale-answer guard as above.
    effect(() => {
      const shown = this.current();
      const load = this.loadMedia();
      this.media.set(undefined);
      this.mediaFailed.set(false);
      if (untracked(this.resolvedOkey) !== shown.okey) { this.resolvedFolderId.set(''); this.resolvedOkey.set(''); }   // paged to another entry
      // a day entry without folder id still asks: the function finds its day folder by date
      if (!shown.driveFolderId && shown.scope !== 'day') return;
      load(shown)
        .then(media => { if (this.current().okey === shown.okey) this.showMedia(shown, media); })
        .catch(() => { if (this.current().okey === shown.okey) this.mediaFailed.set(true); });
    });
    // The day's recorded tracks, same stale-answer guard; no tracks is the fallback for any failure.
    effect(() => {
      const shown = this.current();
      const load = this.loadTracks();
      this.tracks.set([]);
      if (shown.scope !== 'day') return;
      load(shown)
        .then(tracks => { if (this.current().okey === shown.okey) this.tracks.set(tracks); })
        .catch(() => { /* no tracks */ });
    });
    // Thumbnails of the track photos (cached per path in the store); an answer after paging away is dropped.
    effect(() => {
      const tiles = this.trackPhotos();
      const load = this.loadTrackThumb();
      const okey = untracked(this.current).okey;
      const known = untracked(this.trackThumbs);
      for (const tile of tiles) {
        const path = tile.thumbPath;
        if (!path || known.has(path)) continue;
        load(path)
          .then(src => { if (this.current().okey === okey) this.trackThumbs.update(m => new Map(m).set(path, src)); })
          .catch(() => { if (this.current().okey === okey) this.trackThumbs.update(m => new Map(m).set(path, '')); });
      }
    });
  }

  /**
   * Full-size slider over all images of the day, starting at the tapped one. The slider takes its
   * URLs up front, so the slider-size renditions are loaded first (the store caches them, a second
   * tap opens at once); an image whose rendition fails is shown at thumbnail size.
   */
  protected async openImage(index: number): Promise<void> {
    const tapped = this.media()?.images[index];
    if (isDiaryVideo(tapped)) {   // Drive's own player — the slider shows images only
      if (tapped?.webViewLink) await Browser.open({ url: tapped.webViewLink });
      return;
    }
    if (this.sliderLoading()) return;
    const shown = this.current();
    const files = (this.media()?.images ?? []).filter(f => !!f.thumbnail && !isDiaryVideo(f));
    if (!files.length) return;
    const large = new Map<string, string>();
    this.sliderLoading.set(true);
    try {
      let next = 0;
      const worker = async () => {
        while (next < files.length) {
          const file = files[next++];
          const url = await this.loadImage()(shown, file.id).catch(() => '');
          if (url) large.set(file.id, url);
        }
      };
      await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, files.length) }, worker));
    } finally {
      this.sliderLoading.set(false);
    }
    if (this.current().okey !== shown.okey) return;   // paged away while loading
    const { images, startIndex } = diarySliderImages(this.media()?.images ?? [], index, large);
    await showImageSlider(this.modalController, images, { ...IMAGE_STYLE_SHAPE }, startIndex);
  }

  /** A track photo opens its track's view with that photo shown on the map. */
  protected openTrackPhoto(index: number): void {
    const tile = this.trackPhotos()[index];
    const card = tile ? this.tracks()[tile.cardIndex] : undefined;
    if (tile && card) void this.openTrack()(card, tile.photoIndex);
  }

  protected async openDocument(index: number): Promise<void> {
    const file = this.media()?.documents[index];
    if (file?.webViewLink) await Browser.open({ url: file.webViewLink });
  }

  protected async fetchWeather(): Promise<void> {
    const shown = this.current();
    this.weatherBusy.set(true);
    try {
      const updated = await this.refreshWeather()(shown).catch(() => undefined);
      if (updated && this.current().okey === shown.okey) this.current.set(updated);
    } finally {
      this.weatherBusy.set(false);
    }
  }

  /** Reads the day folder again — new or removed photos, videos and files show up without leaving the entry. */
  protected reloadMedia(): void {
    const shown = this.current();
    this.media.set(undefined);
    this.mediaFailed.set(false);
    this.loadMedia()(shown, true)
      .then(media => { if (this.current().okey === shown.okey) this.showMedia(shown, media); })
      .catch(() => { if (this.current().okey === shown.okey) this.mediaFailed.set(true); });
  }

  private showMedia(shown: DiaryModel, media: DiaryMediaResult): void {
    this.media.set(media);
    this.resolvedOkey.set(shown.okey);
    this.resolvedFolderId.set(media.folderId ?? '');
  }

  /** a linked location opens its read-only view; a free-text one has nothing to open */
  protected tapLocation(loc: AvatarInfo): void {
    if (loc.key) void this.openLocation()(loc);
  }

  protected go(target: DiaryModel | undefined): void {
    if (target) this.current.set(target);
  }

  protected async openDrive(): Promise<void> {
    await Browser.open({ url: this.driveUrl() });
  }

  /** Hands over to the editor: the store re-opens the SHOWN entry in DiaryEditModal on role 'edit'. */
  protected async edit(): Promise<void> {
    await dismissOverlay(this.modalController, this.current(), 'edit');
  }
}

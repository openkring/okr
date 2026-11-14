import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { AlbumSectionComponent, ArticleSectionComponent, HeroSectionComponent } from '@okr/cms-section-feature';
import type { HeroOverlayText } from '@okr/cms-section-util';
import { elevationProfile, ElevationPoint, hasRelief } from '@okr/mobility-tracker-util';
import { TrackElevation, TrackElevationI18n, TrackMap, TrackMapPhoto, TrackMapTileSource } from '@okr/mobility-tracker-ui';
import { AlbumSection, ArticleSection, HeroSection, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, SectionModel } from '@okr/shared-models';
import { MapView, RouteBaseLayer, RouteMap, RoutePin, showImageSlider } from '@okr/shared-ui';
import { JournalVideoBlock, VideoClip } from '@okr/travel-journal-ui';
import { Bbox, TrackCopy, trackPointsOf } from '@okr/travel-journal-util';

import { googleAttributionOf } from './journal-base-layers';

type GoogleType = 'roadmap' | 'satellite';

/** A map section as the parent resolved it (spec 1.154 §3, plan phase 5 decision 5): the footprint, the route, the layers. */
export interface JournalSectionMap {
  center?: [number, number]; // the footprint; undefined without a position (the map fits the route instead)
  zoom?: number;
  pins: RoutePin[];
  route: [number, number][]; // the journal route; [] when the section does not show it
  baseLayers: RouteBaseLayer[];
  selectedBaseId?: string; // the section's layer when offered, else the device's choice
}

/** A photo of a track section: a journal image with its position and urls (thumbnail for the strip and pin, full for the slider). */
export interface JournalTrackPhoto { imageKey: string; lat: number; lng: number; thumb: string; url: string; alt: string }

/** A track section as the parent resolved it (decision 6). `track` undefined: the track has not reached this device. */
export interface JournalSectionTrack {
  track?: Pick<TrackCopy, 'sections'>; // the points stay encoded; decoded here once per change
  summary: string;
  photos: JournalTrackPhoto[]; // the photos shown here (not loadable ones left out by the parent)
  tiles?: TrackMapTileSource[]; // raster, non-Google tiles (ruling R4); undefined = the track map's swisstopo default
}

/** Map and track texts: the layer switch, the notes, the elevation chart. */
export interface JournalSectionMapI18n {
  layerSwitch: string;
  noPosition: string;
  trackMissing: string;
  elevation: TrackElevationI18n;
}

/** Value equality for the resolved map/track data: the maps rebuild or re-centre on every new reference (Task 3). */
const sameJson = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * One section of a footprint (spec 1.154 §2), rendered by the standalone CMS section components — not the
 * SectionDispatcher, whose SectionStore queries Firestore. Presentational: the parent turns the change-log view
 * into a `SectionModel` (`sectionModelOf`), resolves every image `url` from its journal key (`label`), passes the video
 * clips, and for a map or track section the resolved map or track; nothing here reads the journal or Firestore, so the
 * guest page renders with it too.
 *
 * The six journal types: hero, article, album, video, map (`okr-route-map` around the footprint) and track
 * (`okr-track-map`, `okr-track-elevation` when the points carry heights, and a strip of the track's photos). A hero
 * draws `overlayText` over its cover; the page passes it to the footprint's first hero only. The map and track inputs
 * are compared by value, so a re-render of the page does not reset a map the reader is panning.
 *
 * Lives in the feature lib, not in `travel-journal-ui`: the CMS section components are in `cms-section-feature`,
 * which a ui lib must not import (module boundaries).
 */
@Component({
  selector: 'okr-journal-section',
  standalone: true,
  imports: [HeroSectionComponent, ArticleSectionComponent, AlbumSectionComponent, JournalVideoBlock, RouteMap, TrackMap, TrackElevation],
  styles: [`
    :host { display: block; }
    .title { margin: 8px 16px 0; font-size: 1.2rem; font-weight: 600; }
    .summary { margin: 2px 16px 6px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .map { height: 320px; margin: 8px 16px; border-radius: 8px; overflow: hidden; position: relative; }
    .note { margin: 8px 16px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .strip { display: flex; gap: 6px; overflow-x: auto; padding: 4px 16px 8px; }
    .strip button { flex: none; width: 88px; height: 88px; padding: 0; border: 0; border-radius: 6px; overflow: hidden;
      background: var(--ion-color-light); cursor: pointer; }
    .strip img { width: 100%; height: 100%; object-fit: cover; display: block; }
  `],
  template: `
    @switch (section().type) {
      @case ('hero') {
        <okr-hero-section [section]="hero()" [overlayText]="overlayText()" [chipIcon]="chipIcon()" />
      }
      @case ('article') {
        <okr-article-section [section]="article()" [editMode]="editMode()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()"
          (imageSelected)="imageSelected.emit($event)" />
      }
      @case ('album') {
        @if (section().title) { <div class="title">{{ section().title }}</div> }
        <okr-album-section [section]="album()" [explicitImages]="albumImages()" [showStyleSelect]="false" [editMode]="editMode()"
          [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" (imageSelected)="imageSelected.emit($event)" />
      }
      @case ('video') {
        @if (section().title) { <div class="title">{{ section().title }}</div> }
        <okr-journal-video-block [clips]="clips()" [i18n]="{ notLoaded: notLoaded() }" />
      }
      @case ('map') {
        @if (section().title) { <div class="title">{{ section().title }}</div> }
        @if (mapData(); as m) {
          @if (m.center || m.route.length > 0) {
            <div class="map">
              <okr-route-map [route]="m.route" [pins]="m.pins" [center]="m.center" [zoom]="m.zoom"
                [baseLayers]="m.baseLayers" [selectedBaseId]="selectedBaseId()" (selectedBaseIdChange)="chooseBase($event)"
                [layerSwitchLabel]="mapI18n()?.layerSwitch ?? ''" [googleAttribution]="googleAttribution()"
                (viewChanged)="view.set($event)" (googleTileError)="googleTileError.emit($event)" />
            </div>
          } @else {
            <p class="note">{{ mapI18n()?.noPosition }}</p>
          }
        }
      }
      @case ('track') {
        @if (section().title) { <div class="title">{{ section().title }}</div> }
        @if (trackData(); as t) {
          @if (t.summary) { <p class="summary">{{ t.summary }}</p> }
          @if (t.track) {
            <div class="map">
              <okr-track-map [sections]="trackSections()" [photos]="trackPins()" [tiles]="t.tiles" [wheelZoom]="false"
                [photosClickable]="true" [highlight]="highlight()" (photoClicked)="openPhoto($event)" />
            </div>
            @if (profile(); as p) {
              @if (mapI18n(); as i18n) {
                <okr-track-elevation [profile]="p" [i18n]="i18n.elevation" (pointed)="point($event)" />
              }
            }
            @if (t.photos.length > 0) {
              <div class="strip">
                @for (photo of t.photos; track photo.imageKey; let i = $index) {
                  <button type="button" [attr.aria-label]="photo.alt" (click)="openPhoto(i)">
                    <img [src]="photo.thumb" [alt]="photo.alt" loading="lazy" decoding="async" />
                  </button>
                }
              </div>
            }
          } @else {
            <p class="note">{{ mapI18n()?.trackMissing }}</p>
          }
        }
      }
    }
  `,
})
export class JournalSection {
  private readonly modalController = inject(ModalController);

  /** The section with every image `url` resolved (images that cannot be shown are left out by the parent). */
  public readonly section = input.required<SectionModel>();
  /** video: the clips with their poster and mp4 urls */
  public readonly clips = input<VideoClip[]>([]);
  /** hero: the footprint's lines over the cover; undefined draws the CMS hero card */
  public readonly overlayText = input<HeroOverlayText | undefined>(undefined);
  /** hero: an icon in front of the chip with exactly this text (the weather chip) */
  public readonly chipIcon = input<{ chip: string; name: string; set: string } | undefined>(undefined);
  public readonly editMode = input(false);
  /** video: the note on a clip whose mp4 is not on this device yet */
  public readonly notLoaded = input('');
  /** article, album: the badge per image, by journal image key (`label`) — «❤ n · 💬 n» (spec 1.154 §7) */
  public readonly imageBadges = input<Record<string, string>>({});
  /** article, album: a tap on an image goes to `imageSelected` (its feedback sheet) instead of the image's own action */
  public readonly emitImageClicks = input(false);
  /** map: the resolved map */
  public readonly map = input<JournalSectionMap | undefined>(undefined);
  /** track: the resolved track */
  public readonly track = input<JournalSectionTrack | undefined>(undefined);
  public readonly mapI18n = input<JournalSectionMapI18n | undefined>(undefined);
  /** map: the viewport copyright of a selected Google layer; without it a Google layer shows the logo only */
  public readonly googleAttributionFetch = input<((view: Bbox, zoom: number, type: GoogleType) => Promise<string>) | undefined>(undefined);
  public readonly imageSelected = output<ImageConfig>();
  /** map: the reader chose another base layer (the page may keep it as this device's choice) */
  public readonly baseLayerSelected = output<string>();
  /** map: Google tiles failed (the session may have expired) */
  public readonly googleTileError = output<GoogleType>();

  protected readonly hero = computed(() => this.section() as HeroSection);
  protected readonly article = computed(() => this.section() as ArticleSection);
  protected readonly album = computed(() => this.section() as AlbumSection);
  protected readonly albumImages = computed<ImageConfig[]>(() => (this.section() as AlbumSection).properties.images ?? []);

  // ---------------------------------------------------------------- map
  protected readonly mapData = computed(() => this.map(), { equal: sameJson });
  /** the layer the reader chose on this map; it wins over the section's layer while offered */
  private readonly chosenBase = signal<string | undefined>(undefined);
  protected readonly selectedBaseId = computed(() => {
    const chosen = this.chosenBase();
    const map = this.mapData();
    return chosen && map?.baseLayers.some((l) => l.id === chosen) ? chosen : map?.selectedBaseId;
  });
  protected readonly view = signal<MapView | undefined>(undefined);
  private readonly selectedGoogleType = computed(() => this.mapData()?.baseLayers.find((l) => l.id === this.selectedBaseId())?.googleType);
  protected readonly googleAttribution = googleAttributionOf(this.selectedGoogleType, this.view,
    (bbox, zoom, type) => this.googleAttributionFetch()?.(bbox, zoom, type) ?? Promise.resolve(''));

  protected chooseBase(id: string | undefined): void {
    if (!id) return;
    this.chosenBase.set(id);
    this.baseLayerSelected.emit(id);
  }

  // ---------------------------------------------------------------- track
  protected readonly trackData = computed(() => this.track(), { equal: sameJson });
  protected readonly trackSections = computed(() => {
    const track = this.trackData()?.track;
    return track ? trackPointsOf(track) : [];
  });
  /** the height profile, only when the points carry heights and there is relief to show (as in the tracker) */
  protected readonly profile = computed(() => {
    const profile = elevationProfile(this.trackSections());
    return hasRelief(profile) ? profile : undefined;
  });
  protected readonly trackPins = computed<TrackMapPhoto[]>(() =>
    (this.trackData()?.photos ?? []).map((p) => ({ lat: p.lat, lng: p.lng, src: p.thumb || undefined, hidden: false })));
  protected readonly highlight = signal<{ lat: number; lng: number } | undefined>(undefined);

  protected point(point: ElevationPoint | undefined): void {
    this.highlight.set(point ? { lat: point.lat, lng: point.lng } : undefined);
  }

  /** A photo of the strip or a pin on the map: the photos full size, from that one on. */
  protected openPhoto(index: number): void {
    const photos = this.trackData()?.photos ?? [];
    if (index < 0 || index >= photos.length) return;
    const images: ImageConfig[] = photos.map((p) => ({ ...IMAGE_CONFIG_SHAPE, label: p.imageKey, url: p.url, altText: p.alt }));
    void showImageSlider(this.modalController, images, { ...IMAGE_STYLE_SHAPE }, index);
  }
}

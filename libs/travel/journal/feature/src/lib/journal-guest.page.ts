import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, IonContent, IonHeader, IonSpinner, ModalController, ToastController } from '@ionic/angular';

import { COMMENT_LIST_I18N_KEYS, CommentListI18n } from '@okr/comment-util';
import { GoogleMapType, GoogleTiles } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { IMAGE_STYLE_SHAPE, ImageConfig, MapConfig, SectionFeedback, SectionModel } from '@okr/shared-models';
import { MapView, RouteMap, RoutePin, showImageSlider } from '@okr/shared-ui';
import { fill, registerBundledIcons, sunTimesLine } from '@okr/shared-util-core';
import { GuestFeedbackView, GuestFootprintView, GuestJournalView, GuestSectionView, guestErrorOf, JournalGuestService } from '@okr/travel-journal-data-access';
import {
  baseLayerOptions, BaseLayerOption, Bbox, boundsOf, filledHero, guestTrackData, GuestTrackInput, trackPointsOf, trackTileSources, FlyPoint, FlyStop, flyoverTimeline, footprintOverlayText, GIBS_BLUE_MARBLE, guestSectionItems, JOURNAL_I18N_KEYS,
  imageTitle, JournalI18n, parentKeyOf, pickBaseLayer, stopTime, travelStartDate, weatherLine, weatherOf,
} from '@okr/travel-journal-util';
import { weatherCodeToIcon, WEATHER_ICON_SET } from '@okr/weather-util';

import { googleAttributionOf, routeBaseLayers } from './journal-base-layers';
import {
  FeedbackReaction, FeedbackText, FeedbackThread, IMAGE_ACTION, imageBadgesOf, imageParentKey, ImageThread, JournalFeedback, openImageSheet,
  sectionImages, toggledReaction,
} from './journal-feedback';
import { JOURNAL_ICONS } from './journal-icons';
import { openJournalFlyover } from './journal-flyover-open';
import { GoogleTemplates, JournalGoogleSessions } from './journal-google-sessions';
import { JournalSection, JournalSectionMap, JournalSectionMapI18n, JournalSectionTrack } from './journal-section';

const browserOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

/** A server older than 1.154 phase 4 sends no switches and cannot take section feedback: nothing is offered then. */
const NO_FEEDBACK: SectionFeedback = { comments: false, reactions: false, imageComments: false, imageReactions: false };
const NO_THREAD: GuestFeedbackView = { reactions: [], comments: [] };

/** The image whose comments the guest opened from its sheet. */
interface OpenImage { sectionKey: string; image: ImageConfig; index: number }

/**
 * The journal for a guest (spec 1.113 §7, plan 7): opened with the personal link, no sign-in. Everything comes
 * from the `journalGuest` callable with the link code — published footprints, photos, and the reactions and
 * comments of every section and image (spec 1.154 §7) — and the guest reacts, comments and chooses their
 * notifications. Every write goes through `act` and reloads the view. `?mute=1` (the link in every message)
 * switches notifications off on opening.
 *
 * The map offers the online base layers (phase 4 design §2: Google when a Map Tiles session exists, swisstopo in
 * Switzerland, the world map). Guests download nothing, so the options come from the pure `baseLayerOptions` without
 * areas, and the Google sessions come from the same JournalGoogleSessions as in the author's JournalStore (which the
 * guest page does not use): offered after a successful Google request, dropped offline, proven again when the browser
 * is back online or the page visible again.
 *
 * Looks like the tenant's website, not like the app (spec 1.126 §2.1): fonts, colours and a plain header from the
 * app's `--okr-site-*` tokens (apps/<app>/src/theme/site-tokens.scss), each with the app theme as fallback.
 */
@Component({
  selector: 'okr-journal-guest-page',
  imports: [IonHeader, IonContent, IonSpinner, RouteMap, JournalFeedback, JournalSection],
  styles: [`
    :host {
      --site-font: var(--okr-site-font, var(--ion-font-family));
      --site-paper: var(--okr-site-paper, var(--ion-background-color));
      --site-surface: var(--okr-site-surface, var(--ion-card-background, var(--ion-background-color)));
      --site-ink: var(--okr-site-ink, var(--ion-text-color));
      --site-ink-soft: var(--okr-site-ink-soft, var(--ion-color-medium));
      --site-line: var(--okr-site-line, var(--ion-color-light));
      --site-brand: var(--okr-site-brand, var(--ion-color-secondary));
      --site-accent: var(--okr-site-accent, var(--ion-color-primary));
      --site-radius: var(--okr-site-radius, 8px);
      --site-max-w: var(--okr-site-max-w, 860px);
      font-family: var(--site-font); color: var(--site-ink);
    }
    ion-header { box-shadow: none; }
    ion-header::after { display: none; }
    ion-content { --background: var(--site-paper); --color: var(--site-ink); font-family: var(--site-font); }
    .site-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; padding-top: calc(12px + var(--ion-safe-area-top, 0px));
      background: var(--site-surface); border-bottom: 1px solid var(--site-line); font-family: var(--site-font); }
    .site-header h1 { flex: 1; margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--site-brand); letter-spacing: -0.01em; }
    .site-header button { background: none; border: none; padding: 6px 8px; font: inherit; font-weight: 500; color: var(--site-accent); cursor: pointer; }
    .site-header button:hover { text-decoration: underline; }
    .center { text-align: center; padding: 48px 16px; color: var(--site-ink-soft); }
    .map { height: 40vh; min-height: 240px; }
    .wrap { max-width: var(--site-max-w); margin: 0 auto; padding: 8px 16px; }
    .hello { color: var(--site-ink-soft); font-size: 0.95rem; margin: 12px 0 4px; }
    .card { display: flex; gap: 12px; align-items: center; cursor: pointer; margin: 10px 0; padding: 12px;
      background: var(--site-surface); border: 1px solid var(--site-line); border-radius: var(--site-radius); }
    .card:hover { border-color: var(--site-accent); }
    .thumb { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; background: var(--site-line); flex: none; }
    .card h3 { margin: 0 0 4px; font-size: 1rem; font-weight: 600; color: var(--site-ink); }
    .card p { margin: 0; font-size: 0.85rem; color: var(--site-ink-soft); }
    .story { max-width: 760px; margin: 0 auto; padding: 0 16px; }
    .story h2 { margin: 24px 0 4px; font-weight: 600; color: var(--site-brand); letter-spacing: -0.01em; }
    .story .facts { color: var(--site-ink-soft); font-size: 0.9rem; margin-bottom: 16px; }
    .block { margin: 16px 0; }
    .block .by { font-size: 0.8rem; color: var(--site-ink-soft); }
  `],
  template: `
    <ion-header>
      <header class="site-header">
        @if (selected()) { <button type="button" (click)="selectedKey.set(undefined)">{{ i18n.guest_back() }}</button> }
        <h1>{{ view()?.journal?.title || i18n.untitled() }}</h1>
        @if (view()) {
          @if (flyover() && !selected()) { <button type="button" (click)="fly()">{{ i18n.flyover() }}</button> }
          <button type="button" (click)="settings()">{{ i18n.guest_settings() }}</button>
        }
      </header>
    </ion-header>
    <ion-content>
      @if (error()) {
        <p class="center">{{ error() }}</p>
      } @else if (!view()) {
        <div class="center"><ion-spinner /><p>{{ i18n.guest_loading() }}</p></div>
      } @else if (selected(); as fp) {
        <div class="story">
          @if (!hasHero()) {
            <h2>{{ fp.title || i18n.untitled() }}</h2>
            <div class="facts">{{ facts(fp) }}</div>
          }
          @for (item of sections(); track item.section.okey) {
            <div class="block">
              @if (!item.lead && item.authorName) { <div class="by">{{ item.authorName }}</div> }
              <okr-journal-section [section]="item.section" [clips]="item.clips" [overlayText]="item.overlayText" [chipIcon]="item.chipIcon"
                [notLoaded]="i18n.video_not_loaded()" [imageBadges]="item.badges"
                [map]="item.map" [track]="item.track" [mapI18n]="mapI18n()"
                [emitImageClicks]="item.feedback.imageComments || item.feedback.imageReactions" (imageSelected)="tapImage(item, $event)" />
              @if (item.feedback.comments || item.feedback.reactions || item.image) {
                <okr-journal-feedback [section]="item.thread" [feedback]="item.feedback" [image]="item.image" [busy]="sending()"
                  [i18n]="i18n" [commentI18n]="commentI18n" (reacted)="react($event)" (commented)="comment($event)"
                  (deleted)="deleteComment($event)" (imageClosed)="openImage.set(undefined)" />
              }
            </div>
          }
        </div>
      } @else {
        <div class="map">
          <okr-route-map [route]="route()" [pins]="pins()" [baseLayers]="baseLayers()"
            [selectedBaseId]="selectedBaseId()" (selectedBaseIdChange)="chosenBaseId.set($event)"
            [layerSwitchLabel]="i18n.layer_switch()" [googleAttribution]="googleAttribution()"
            (pinClicked)="open($event)" (viewChanged)="mapView.set($event)" (googleTileError)="renewGoogle($event)" />
        </div>
        <div class="wrap">
          <p class="hello">{{ hello() }}</p>
          @for (fp of view()?.footprints ?? []; track fp.key) {
            <div class="card" role="button" tabindex="0" (click)="open(fp.key)" (keydown.enter)="open(fp.key)">
              @if (thumbOf(fp); as thumb) { <img class="thumb" [src]="thumb" alt="" /> } @else { <div class="thumb"></div> }
              <div>
                <h3>{{ fp.title || i18n.untitled() }}</h3>
                <p>{{ facts(fp) }}</p>
                <p>{{ counts(fp) }}</p>
              </div>
            </div>
          } @empty {
            <p class="center">{{ i18n.guest_empty() }}</p>
          }
        </div>
      }
    </ion-content>
  `,
})
export class JournalGuestPage {
  private readonly guestService = inject(JournalGuestService);
  private readonly route$ = inject(ActivatedRoute);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);
  private readonly googleTiles = inject(GoogleTiles);
  private readonly i18nService = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n;
  protected readonly commentI18n = inject(I18nService).translateAll(COMMENT_LIST_I18N_KEYS) as CommentListI18n;
  protected readonly openImage = signal<OpenImage | undefined>(undefined);
  protected readonly sending = signal(false);

  public readonly journalKey = input.required<string>();
  public readonly code = input.required<string>();

  // the base-layer switch: online options only (no downloads), the choice lasts while the page is open
  private readonly google = signal<GoogleTemplates>({});
  private readonly googleSessions = new JournalGoogleSessions(
    this.googleTiles, () => this.i18nService.getActiveLang() || 'de', browserOnline, (google) => this.google.set(google),
  );
  protected readonly mapView = signal<MapView | undefined>(undefined);
  protected readonly chosenBaseId = signal<string | undefined>(undefined); // the guest's pick in the layer sheet
  private readonly baseLayerOptions = computed(() => baseLayerOptions({
    online: true, // everything on this page comes from the network; Google is offered only once a session exists
    google: this.google(), areas: [], usable: new Set(), view: this.mapView()?.bounds, tilesBaseUrl: '',
  }));
  protected readonly baseLayers = computed(() => routeBaseLayers(this.baseLayerOptions(), this.i18n));
  /** The effective choice: the guest's pick when offered, else the default (first Google, else the world map). */
  protected readonly selectedBaseId = computed(() => pickBaseLayer(this.baseLayerOptions(), this.chosenBaseId()));
  private readonly selectedGoogleType = computed(() => this.baseLayerOptions().find((o) => o.id === this.selectedBaseId())?.googleType);
  protected readonly googleAttribution = googleAttributionOf(this.selectedGoogleType, this.mapView, (bbox, zoom, type) => {
    const session = this.googleSessions.session(type);
    const [west, south, east, north] = bbox;
    return session ? this.googleTiles.attribution(session, { west, south, east, north }, zoom) : Promise.resolve('');
  });
  protected readonly view = signal<GuestJournalView | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly selectedKey = signal<string | undefined>(undefined);
  protected readonly selected = computed(() => this.view()?.footprints.find((f) => f.key === this.selectedKey()));

  /**
   * The selected footprint's sections as `okr-journal-section` draws them (spec 1.154 phase 2). Image urls come from the
   * signed photos of the payload by journal key; the first hero leads and carries the footprint's lines (title, place ·
   * day N · date, coordinates, weather), computed from the guest footprint with the author's helpers.
   */
  protected readonly sections = computed(() => {
    const fp = this.selected();
    if (!fp) return [];
    const facts = { ...fp, weather: weatherOf(fp.weather) };
    const view = this.view();
    const startDate = travelStartDate({ startDate: view?.journal.startDate }, view?.footprints ?? []);
    const weather = facts.weather;
    const chipIcon = weather ? { chip: weatherLine(weather), name: weatherCodeToIcon(weather.code), set: WEATHER_ICON_SET } : undefined;
    const byKey = new Map((fp.sections ?? []).map((s) => [s.key, s]));
    return guestSectionItems(fp.sections ?? [], '').map((item) => {
      const feedback = this.feedbackOf(item.section, byKey.get(item.section.okey));
      const resolved = {
        map: item.section.type === 'map' ? this.mapOf(item.section, fp) : undefined,
        track: item.track ? this.trackOf(item.track) : undefined,
      };
      return item.lead
        ? {
          ...item, ...feedback, ...resolved, section: filledHero(item.section, facts), chipIcon,
          overlayText: footprintOverlayText(facts, startDate, (day) => fill(this.i18n.hero_day(), { day })),
        }
        : { ...item, ...feedback, ...resolved, chipIcon: undefined, overlayText: undefined };
    });
  });

  /** The texts of the map and track sections. */
  protected readonly mapI18n = computed<JournalSectionMapI18n>(() => ({
    layerSwitch: this.i18n.layer_switch(), noPosition: this.i18n.map_no_position(), trackMissing: this.i18n.track_missing(),
    elevation: { elevation_title: this.i18n.track_elevation_title, elevation_gain: this.i18n.track_elevation_gain, elevation_loss: this.i18n.track_elevation_loss },
  }));

  /**
   * The base layers a guest's section maps offer: the public ones only (no Google: a guest has no Map Tiles session
   * for these sections and downloads nothing). Without a Google option the list is the world map, plus swisstopo in
   * Switzerland (`baseLayerOptions` with online sources only, no areas).
   */
  private publicLayers(bbox: Bbox | undefined): BaseLayerOption[] {
    return baseLayerOptions({ online: true, google: {}, areas: [], usable: new Set(), view: bbox, tilesBaseUrl: '' });
  }

  /**
   * A map section as a guest sees it (decision 5): centred on the footprint at the section's zoom, the footprint's pin,
   * the route of the payload (`GuestJournalView.route`, published footprints only) when the section shows it. The
   * section's own layer when it is a public one, else the world map. The page recomputes often; `okr-journal-section`
   * compares the data by value.
   */
  private mapOf(model: SectionModel, fp: GuestFootprintView): JournalSectionMap {
    const config = model.properties as unknown as MapConfig;
    const center: [number, number] | undefined = typeof fp.latitude === 'number' && typeof fp.longitude === 'number' ? [fp.latitude, fp.longitude] : undefined;
    const options = this.publicLayers(center ? [center[1], center[0], center[1], center[0]] : undefined);
    const selectedBaseId = pickBaseLayer(options, config.layer);
    const pins: RoutePin[] = center ? [{ key: fp.key, lat: center[0], lng: center[1], label: fp.title, thumbnailUrl: this.thumbOf(fp) }] : [];
    return {
      center, zoom: config.zoom, pins, route: config.showRoute ? (this.view()?.route ?? []) : [],
      baseLayers: routeBaseLayers(options, this.i18n), selectedBaseId,
    };
  }

  /**
   * A track section as a guest sees it (decision 6): the payload's track (encoded sections, photos with signed urls
   * by image key), and raster, non-Google tiles (R4) from the public layers around the track.
   */
  private trackOf(track: GuestTrackInput): JournalSectionTrack {
    const data = guestTrackData(track, this.i18n.track_untitled(), (n) => fill(this.i18n.image_photo(), { n }));
    const bbox = boundsOf(trackPointsOf(data.track).flatMap((s) => s.points));
    const options = this.publicLayers(bbox);
    const tiles = trackTileSources(options, pickBaseLayer(options, undefined), true);
    return { ...data, ...(tiles ? { tiles } : {}) };
  }
  protected readonly hasHero = computed(() => this.sections().some((s) => s.lead));

  /**
   * A section's feedback from the payload (spec 1.154 §7): its switches, its own thread, the images of an article or
   * album with their badges, and the image whose comments are open. The phase-4 fields are optional (an older server).
   */
  private feedbackOf(section: SectionModel, guest: GuestSectionView | undefined): {
    feedback: SectionFeedback; thread: FeedbackThread; images: ImageConfig[]; badges: Record<string, string>; image: ImageThread | undefined;
  } {
    const feedback = guest?.feedback ?? NO_FEEDBACK;
    const imageThread = (image: ImageConfig): FeedbackThread => ({ parentKey: imageParentKey(image), ...(guest?.images?.[image.label] ?? NO_THREAD) });
    const sectionKey = section.okey;
    const images = feedback.imageComments || feedback.imageReactions ? sectionImages(section) : [];
    const open = this.openImage();
    const image = open?.sectionKey === sectionKey && images.some((i) => i.label === open.image.label)
      ? { ...imageThread(open.image), title: this.imageName(open.image, open.index) } : undefined;
    return {
      feedback, images, image, badges: imageBadgesOf(images, feedback, imageThread),
      thread: { parentKey: parentKeyOf({ kind: 'section', id: sectionKey }), reactions: guest?.reactions ?? [], comments: guest?.comments ?? [] },
    };
  }

  private imageName(image: ImageConfig, index: number): string {
    return imageTitle(image, index, (n) => fill(this.i18n.image_photo(), { n }));
  }

  protected readonly pins = computed<RoutePin[]>(() => (this.view()?.footprints ?? [])
    .filter((f) => typeof f.latitude === 'number' && typeof f.longitude === 'number')
    .map((f) => ({ key: f.key, lat: f.latitude as number, lng: f.longitude as number, label: f.title, thumbnailUrl: this.thumbOf(f) })));
  protected readonly route = computed<[number, number][]>(() => (this.view()?.footprints ?? [])
    .flatMap((f) => (f.sections ?? []).flatMap((b) => b.photos))
    .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
    .sort((a, b) => ((a.takenAt ?? '') < (b.takenAt ?? '') ? -1 : 1))
    .map((p) => [p.latitude as number, p.longitude as number] as [number, number]));
  /** Published footprints only (the guest view): a hidden draft merges into the next stretch. */
  protected readonly flyover = computed(() => {
    const footprints = (this.view()?.footprints ?? []).filter((f) => typeof f.latitude === 'number' && typeof f.longitude === 'number');
    const stops = footprints.map((f): FlyStop => ({
      key: f.key, lat: f.latitude as number, lng: f.longitude as number, at: stopTime(f.date, f.time), title: f.title,
      transport: f.transport, thumb: this.thumbOf(f),
    }));
    const points = (this.view()?.footprints ?? []).flatMap((f) => (f.sections ?? []).flatMap((b) => b.photos))
      .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
      .map((p): FlyPoint => ({ lat: p.latitude as number, lng: p.longitude as number, at: p.takenAt ?? '' }));
    return flyoverTimeline(stops, points);
  });
  protected readonly hello = computed(() => fill(this.i18n.guest_hello(), { name: this.view()?.me.name ?? '' }));

  public constructor() {
    registerBundledIcons(JOURNAL_ICONS); // hero and section icons without the icon database (guests are not signed in)
    effect(() => {
      const journalKey = this.journalKey();
      const code = this.code();
      untracked(() => void this.start(journalKey, code));
    });
    this.watchGoogle();
  }

  /** The first Google proof, then: dropped offline, proven again when the browser is back online or the page visible. */
  private watchGoogle(): void {
    this.googleSessions.refresh();
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const online = (): void => this.googleSessions.refresh(true);
    const offline = (): void => this.googleSessions.drop();
    const visible = (): void => { if (document.visibilityState === 'visible') this.googleSessions.refresh(true); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
    });
  }

  /** Google refused tiles (expired session, design §1): one new session, at most every 5 minutes per type. */
  protected renewGoogle(type: GoogleMapType): void {
    this.googleSessions.renew(type);
  }

  private async start(journalKey: string, code: string): Promise<void> {
    if (this.route$.snapshot.queryParamMap.get('mute') === '1') {
      await this.guestService.act(journalKey, code, 'mute').then(() => this.toast(this.i18n.guest_muted()), () => undefined);
    }
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.view.set(await this.guestService.view(this.journalKey(), this.code()));
      this.error.set('');
    } catch (error) {
      const { code } = guestErrorOf(error);
      this.error.set(code === 'permission-denied' || code === 'not-found' || code === 'invalid-argument' ? this.i18n.guest_link_invalid() : this.i18n.error_generic());
    }
  }

  protected async fly(): Promise<void> {
    const timeline = this.flyover();
    if (timeline) await openJournalFlyover(this.modalController, timeline, [GIBS_BLUE_MARBLE], this.i18n);
  }

  protected open(footprintKey: string): void {
    this.selectedKey.set(footprintKey);
  }

  protected thumbOf(fp: GuestFootprintView): string | undefined {
    return (fp.sections ?? []).flatMap((b) => b.photos)[0]?.thumb;
  }

  protected facts(fp: GuestFootprintView): string {
    const date = /^\d{8}$/.test(fp.date) ? `${fp.date.slice(6, 8)}.${fp.date.slice(4, 6)}.${fp.date.slice(0, 4)}` : '';
    return [date, fp.time, fp.placeName, weatherLine(weatherOf(fp.weather)), sunTimesLine(weatherOf(fp.weather))].filter((x) => x).join(' · ');
  }

  /** «❤ n  💬 n» on a footprint's card: every reaction and comment of its sections and images. */
  protected counts(fp: GuestFootprintView): string {
    const threads = (fp.sections ?? []).flatMap((s): GuestFeedbackView[] =>
      [{ reactions: s.reactions ?? [], comments: s.comments ?? [] }, ...Object.values(s.images ?? {})]);
    const reactions = threads.reduce((sum, t) => sum + t.reactions.reduce((n, r) => n + r.count, 0), 0);
    const comments = threads.reduce((sum, t) => sum + t.comments.length, 0);
    return [reactions > 0 ? `♥ ${reactions}` : '', comments > 0 ? `💬 ${comments}` : ''].filter((x) => x).join('  ');
  }

  /** `mine` comes from the server: the guest's own reactions and comments (they delete only their own, plan 8). */
  protected react(reaction: FeedbackReaction): Promise<void> {
    return this.act(reaction.active ? 'react' : 'unreact', { parentKey: reaction.parentKey, emoji: reaction.emoji });
  }

  protected async comment(comment: FeedbackText): Promise<void> {
    this.sending.set(true);
    try {
      await this.act('comment', { parentKey: comment.parentKey, text: comment.text });
    } finally {
      this.sending.set(false);
    }
  }

  protected async deleteComment(commentKey: string): Promise<void> {
    await this.act('deleteComment', { commentKey });
  }

  /** A tap on an image of an article or album: its sheet (spec 1.154 §7). */
  protected async tapImage(item: { section: { okey: string }; feedback: SectionFeedback; images: ImageConfig[] }, image: ImageConfig): Promise<void> {
    const index = Math.max(0, item.images.findIndex((i) => i.label === image.label));
    const view = this.selected()?.sections?.find((s) => s.key === item.section.okey);
    const thread: FeedbackThread = { parentKey: imageParentKey(image), ...(view?.images?.[image.label] ?? NO_THREAD) };
    const choice = await openImageSheet(this.modalController, this.toastController, this.i18n, { image, index, feedback: item.feedback, thread, canWrite: true });
    if (choice?.kind === 'react') return this.react(toggledReaction(thread.parentKey, thread.reactions, choice.emoji));
    switch (choice?.id) {
      case IMAGE_ACTION.comment:
      case IMAGE_ACTION.comments: return this.openImage.set({ sectionKey: item.section.okey, image, index });
      case IMAGE_ACTION.slider: return showImageSlider(this.modalController, item.images, { ...IMAGE_STYLE_SHAPE }, index);
    }
  }

  protected async settings(): Promise<void> {
    const me = this.view()?.me;
    if (!me) return;
    const mark = (on: boolean) => (on ? '✓ ' : '');
    const sheet = await this.actionSheetController.create({
      header: this.i18n.guest_settings_title(),
      buttons: [
        { text: mark(me.channel === 'email') + this.i18n.guest_channel_email(), handler: () => void this.act('settings', { channel: 'email' }) },
        me.muted
          ? { text: this.i18n.guest_unmute(), handler: () => void this.act('unmute').then(() => this.toast(this.i18n.guest_unmuted())) }
          : { text: this.i18n.guest_mute(), handler: () => void this.act('mute').then(() => this.toast(this.i18n.guest_muted())) },
        { text: this.i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async act(action: Parameters<JournalGuestService['act']>[2], extra: Parameters<JournalGuestService['act']>[3] = {}): Promise<void> {
    try {
      await this.guestService.act(this.journalKey(), this.code(), action, extra);
      await this.load();
    } catch {
      await this.toast(this.i18n.error_generic());
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}

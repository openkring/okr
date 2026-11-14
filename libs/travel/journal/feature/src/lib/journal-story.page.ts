import { Component, computed, DestroyRef, effect, inject, Injector, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonTitle, IonToolbar,
  ModalController, PopoverController, ToastController,
} from '@ionic/angular';

import type { HeroOverlayText } from '@okr/cms-section-util';
import { COMMENT_LIST_I18N_KEYS, CommentListI18n } from '@okr/comment-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { showImageSlider } from '@okr/shared-ui';
import { fill, registerBundledIcons } from '@okr/shared-util-core';
import { FootprintEditModal, JournalFeedbackAction, JournalSectionSortModal, SortableSection, VideoClip } from '@okr/travel-journal-ui';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CategoryItemModel, CategoryListModel, IMAGE_STYLE_SHAPE, ImageConfig, MapConfig, SectionFeedback, SectionModel, UserModel } from '@okr/shared-models';
import {
  addableSectionTypes, Bbox, boundsOf, feedbackOf, filledHero, footprintMenu, FootprintFormModel, FootprintView, footprintOverlayText, heroHasCover, htmlToPlainText,
  imageTitle, ImageView, journalMapData, parentKeyOf, sectionTrackKey, trackPointsOf, trackSummary, trackTileSources,
  isJournalSectionType, JournalSectionType, lostValueText, photoFileName, sectionActions, sectionModelOf, SectionView, sortByOrder,
  travelStartDate, weatherLine,
} from '@okr/travel-journal-util';
import { weatherCodeToIcon, WEATHER_ICON_SET } from '@okr/weather-util';

import {
  FeedbackReaction, FeedbackText, FeedbackThread, IMAGE_ACTION, ImageThread, imageBadgesOf, imageParentKey, JournalFeedback, openImageSheet,
  sectionImages, toggledReaction,
} from './journal-feedback';
import { JournalFileUrlService } from './journal-file-url.service';
import { showJournalError } from './journal-errors';
import { openJournalMenu } from './journal-menu-open';
import { JOURNAL_ICONS } from './journal-icons';
import { routeBaseLayers } from './journal-base-layers';
import { JournalSection, JournalSectionMap, JournalSectionMapI18n, JournalSectionTrack, JournalTrackPhoto } from './journal-section';
import { journalSectionPickerInjector, journalTrackPicker } from './journal-section-picker';
import { JournalStore } from './journal.store';

/** One section as the story renders it: the change-log view, the CMS model with resolved urls, and what the page adds. */
interface StorySection {
  view: SectionView;
  section: SectionModel;
  clips: VideoClip[];
  overlayText: HeroOverlayText | undefined; // the leading hero only
  lead: boolean; // the leading hero: it carries the footprint's lines, so the plain title is not shown
  missing: number; // browser: photos signed but not in the bucket yet (still drafts on the iPad)
  feedback: SectionFeedback; // the switches in effect (a hero: all off)
  thread: FeedbackThread; // the section's own reactions and comments
  images: ImageConfig[]; // article, album: the images shown, urls resolved
  badges: Record<string, string>; // per image label: «❤ n · 💬 n»
  image: ImageThread | undefined; // the image whose comments are open under the section
  map: JournalSectionMap | undefined; // a map section, resolved
  track: JournalSectionTrack | undefined; // a track section, resolved
}

/** The image whose comments the author opened from its sheet. */
interface OpenImage { sectionKey: string; image: ImageConfig; index: number }

/** The CMS i18n of the section types (card-select builds `<i18n>.<type>.label`). */
const SECTION_TYPE_I18N = '@cms/section/feature.section_type';

/**
 * A footprint's story page (spec 1.154): its CMS sections — hero, article, album, video — rendered by
 * `okr-journal-section` with the standalone CMS section components (not the SectionDispatcher, whose SectionStore
 * queries Firestore). Edited like a CMS content page (spec 1.126 §5): ⋮ menu with an edit-mode toggle, «Sektion
 * hinzufügen» through the CMS card-select, sections highlighted in edit mode, a tap opens the section's ActionSheet and
 * «Bearbeiten» the CMS section editor in journal mode with the journal's photo picker. Every author edits every
 * section; an edit takes a lock first (released in `finally`, and on page destroy); conflict copies and overwritten
 * footprint values are flagged until resolved. Under every section but the hero, and on each image of an article or
 * album, its reactions and comments (spec 1.154 §7, `okr-journal-feedback`): written as change records through the
 * store, offline on the iPad like every other record.
 */
@Component({
  selector: 'okr-journal-story-page',
  imports: [
    JournalSection, JournalFeedback,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonButton, IonIcon, SvgIconPipe,
  ],
  styles: [`
    .plain-title { padding: 16px; }
    .plain-title h1 { margin: 0; }
    .plain-title p { margin: 4px 0 0; color: var(--ion-color-medium); }
    .section { position: relative; }
    /* the CMS edit-mode highlight (content.page .section-wrapper.editable) */
    .section.editable { border: 3px solid var(--ion-color-primary); border-radius: 8px; margin: 8px; padding: 4px; cursor: pointer; }
    .note { font-size: 0.8rem; margin: 4px 8px; color: var(--ion-color-warning-shade); }
    .banner { margin: 8px; padding: 8px 12px; border-radius: 8px; background: var(--ion-color-warning-tint); display: flex; align-items: center; gap: 8px; }
    .banner p { margin: 0; flex: 1; }
    .badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 8px; background: var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/journal/' + journalKey()" /></ion-buttons>
        <ion-title>{{ footprint()?.title || store.i18n.untitled() }}</ion-title>
        <ion-buttons slot="end">
          <span class="badge">{{ footprint()?.publishState === 'published' ? store.i18n.story_published() : store.i18n.story_draft() }}</span>
          @if (menuItems().length > 0) {
            <ion-button (click)="menu($event)" [attr.aria-label]="store.i18n.menu_open()"><ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" /></ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.videoPreparing()) {
        <p class="note">{{ store.i18n.video_preparing() }}@if (store.webUpload(); as upload) { {{ upload.done }}/{{ upload.total }} }</p>
      } @else if (store.webUpload(); as upload) {
        <p class="note">{{ uploading(upload.done, upload.total) }}</p>
      }
      @if (footprint(); as fp) {
        @if (!sections()[0]?.lead) {
          <div class="plain-title">
            <h1>{{ fp.title || store.i18n.untitled() }}</h1>
            <p>{{ fp.placeName }}</p>
          </div>
        }
        @if (canEdit()) {
          @for (lost of fp.lostValues; track lost.hlc + lost.field) {
            <div class="banner">
              <p>{{ overwritten(lost.field, lost.value) }}</p>
              <ion-button size="small" fill="outline" (click)="act(store.dismissFootprintConflict(footprintKey(), lost.hlc))">{{ store.i18n.conflict_done() }}</ion-button>
            </div>
          }
        }
        @for (item of sections(); track item.view.key) {
          @if (canEdit() && item.view.conflict) {
            <p class="note">{{ store.i18n.section_conflict() }}</p>
          }
          @if (editMode() && lockedBy(item.view); as name) {
            <p class="note">{{ fillName(name) }}</p>
          }
          <div class="section" [class.editable]="editMode() && canEdit()" (click)="tapSection(item.view)">
            <okr-journal-section [section]="item.section" [clips]="item.clips" [overlayText]="item.overlayText" [chipIcon]="weatherChipIcon()"
              [editMode]="editMode()" [notLoaded]="store.i18n.video_not_loaded()" [imageBadges]="item.badges"
              [emitImageClicks]="item.feedback.imageComments || item.feedback.imageReactions" (imageSelected)="tapImage(item, $event)"
              [map]="item.map" [track]="item.track" [mapI18n]="mapI18n()" [googleAttributionFetch]="googleFetch"
              (baseLayerSelected)="store.selectBaseLayer($event)" (googleTileError)="store.renewGoogle($event)" />
          </div>
          @if (item.feedback.comments || item.feedback.reactions || item.image) {
            <okr-journal-feedback [section]="item.thread" [feedback]="item.feedback" [image]="item.image" [canWrite]="canEdit()" [busy]="sending()"
              [i18n]="store.i18n" [commentI18n]="commentI18n" (reacted)="react($event)" (commented)="comment($event)"
              (deleted)="deleteComment($event)" (imageClosed)="openImage.set(undefined)" />
          }
          @if (item.missing > 0) {
            <p class="note">{{ onIpad(item.missing) }}</p>
          }
        }
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button [disabled]="!previousKey()" (click)="go(previousKey())">{{ store.i18n.story_previous() }}</ion-button>
          <ion-button [disabled]="!nextKey()" (click)="go(nextKey())">{{ store.i18n.story_next() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class JournalStoryPage {
  protected readonly store = inject(JournalStore);
  private readonly appStore = inject(AppStore);
  private readonly fileUrl = inject(JournalFileUrlService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);
  private readonly popoverController = inject(PopoverController);

  public readonly journalKey = input.required<string>();
  public readonly footprintKey = input.required<string>();

  protected readonly editMode = signal(false);
  protected readonly commentI18n = inject(I18nService).translateAll(COMMENT_LIST_I18N_KEYS) as CommentListI18n;
  protected readonly openImage = signal<OpenImage | undefined>(undefined);
  protected readonly sending = signal(false);
  protected readonly menuItems = computed(() => footprintMenu({ native: this.store.native(), canWrite: this.store.canWrite(), editMode: this.editMode() }));

  protected async act(action: Promise<unknown>): Promise<void> {
    try {
      await action;
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
    }
  }

  protected readonly footprints = computed(() => this.store.footprints(this.journalKey()));
  protected readonly footprint = computed(() => this.footprints().find((f) => f.key === this.footprintKey()));
  protected readonly weatherChipIcon = computed(() => {
    const weather = this.footprint()?.weather;
    return weather ? { chip: weatherLine(weather), name: weatherCodeToIcon(weather.code), set: WEATHER_ICON_SET } : undefined;
  });
  /** The trip's first day, for the hero's «Tag N». */
  private readonly startDate = computed(() =>
    travelStartDate(this.store.journals().find((j) => j.key === this.journalKey()) ?? {}, this.footprints()));

  /**
   * The story as the CMS sections render it. The footprint's first hero leads and carries the footprint's lines; any
   * other hero (two added offline at the same time, a conflict copy) takes its place by `order` among the others.
   * Image urls are resolved from the journal image keys; in the browser a photo that is signed but not in the bucket
   * (still a draft photo on the iPad) is left out and counted for a note. A leading hero without a cover to show (none
   * chosen yet, or not loadable here) is not drawn outside edit mode: the plain title stands instead. In edit mode it
   * stays, so the author can tap it and choose a cover. The records keep their keys as they are.
   */
  protected readonly sections = computed<StorySection[]>(() => {
    const fp = this.footprint();
    if (!fp) return [];
    const images = this.store.images(this.journalKey());
    const tenantId = this.appStore.tenantId();
    const lead = fp.sections.find((s) => s.type === 'hero');
    const rest = sortByOrder(fp.sections.filter((s) => s !== lead).map((s) => ({ ...s, okey: s.key })));
    const overlay = lead ? footprintOverlayText(fp, this.startDate(), (day) => fill(this.store.i18n.hero_day(), { day })) : undefined;
    const editMode = this.editMode();
    const open = this.openImage();
    return [...(lead ? [lead] : []), ...rest].map((view) => {
      const model = sectionModelOf(view, tenantId);
      const isLead = view === lead;
      const resolved = this.resolved(isLead ? filledHero(model, fp) : model, images);
      const feedback = feedbackOf(model);
      const shown = feedback.imageComments || feedback.imageReactions ? sectionImages(resolved.section) : [];
      const image = open?.sectionKey === view.key && shown.some((i) => i.label === open.image.label)
        ? { ...this.thread(imageParentKey(open.image)), title: this.imageName(open.image, open.index) } : undefined;
      return {
        ...resolved, view, overlayText: isLead ? overlay : undefined, lead: isLead, feedback, images: shown, image,
        map: view.type === 'map' ? this.mapOf(model, fp) : undefined,
        track: view.type === 'track' ? this.trackOf(view, images) : undefined,
        thread: this.thread(parentKeyOf({ kind: 'section', id: view.key })),
        badges: imageBadgesOf(shown, feedback, (i) => this.thread(imageParentKey(i))),
      };
    }).filter((item) => !item.lead || editMode || heroHasCover(item.section));
  });

  /** The reactions and comments of a section or image, from the journal's log (offline too). */
  private thread(parentKey: string): FeedbackThread {
    return { parentKey, reactions: this.store.feedbackReactions(parentKey), comments: this.store.feedbackComments(parentKey) };
  }

  /** The texts of the map and track sections. */
  protected readonly mapI18n = computed<JournalSectionMapI18n>(() => {
    const i18n = this.store.i18n;
    return {
      layerSwitch: i18n.layer_switch(), noPosition: i18n.map_no_position(), trackMissing: i18n.track_missing(),
      elevation: { elevation_title: i18n.track_elevation_title, elevation_gain: i18n.track_elevation_gain, elevation_loss: i18n.track_elevation_loss },
    };
  });
  /** The viewport copyright of a Google layer on a map section (phase 4 design §1). */
  protected readonly googleFetch = (bbox: Bbox, zoom: number, type: 'roadmap' | 'satellite'): Promise<string> => this.store.googleAttribution(bbox, zoom, type);
  /** The journal route and footprint pins (photo positions in time order, as on the overview). */
  private readonly journalMap = computed(() => journalMapData(this.footprints(), this.store.images(this.journalKey())));

  /**
   * A map section (decision 5): centred on the footprint at the section's zoom, its pin, the journal route when the
   * section shows it, and the journal's base layers around the footprint — the section's layer when this device offers
   * it, else the device's choice (pickBaseLayer).
   */
  private mapOf(model: SectionModel, fp: FootprintView): JournalSectionMap {
    const config = model.properties as unknown as MapConfig;
    const journalKey = this.journalKey();
    const center: [number, number] | undefined = fp.latitude !== undefined && fp.longitude !== undefined ? [fp.latitude, fp.longitude] : undefined;
    const bbox: Bbox | undefined = center ? [center[1], center[0], center[1], center[0]] : undefined;
    const options = this.store.baseLayerOptionsFor(journalKey, bbox);
    const selectedBaseId = config.layer && options.some((o) => o.id === config.layer) ? config.layer : this.store.selectedBaseLayerFor(journalKey, bbox);
    const map = this.journalMap();
    const pins = map.pins.filter((p) => p.key === fp.key)
      .map((p) => ({ key: p.key, lat: p.lat, lng: p.lng, label: p.label, thumbnailUrl: this.fileUrl.url(p.imagePath) }));
    return {
      center, zoom: config.zoom, pins, route: config.showRoute ? map.route : [],
      baseLayers: routeBaseLayers(options, this.store.i18n), selectedBaseId,
    };
  }

  /**
   * A track section (decision 6): the journal's copy of the track, its photos that can be shown here (thumbnail and full
   * size), and the track map's tiles — only raster, non-Google layers (ruling R4). Without the track on this device the
   * section says so.
   */
  private trackOf(view: SectionView, images: Map<string, ImageView>): JournalSectionTrack {
    const track = this.store.track(sectionTrackKey(view));
    if (!track) return { summary: '', photos: [] };
    const native = this.store.native();
    const photos: JournalTrackPhoto[] = track.photos.flatMap((p, i) => {
      const image = images.get(p.imageKey);
      const url = this.fileUrl.url(image?.path2048);
      if (!image || url === '' || (!native && this.fileUrl.isMissing(image.path2048))) return [];
      const alt = fill(this.store.i18n.image_photo(), { n: i + 1 });
      return [{ imageKey: p.imageKey, lat: p.lat, lng: p.lng, thumb: this.fileUrl.url(image.path400) || url, url, alt }];
    });
    const bbox = boundsOf(trackPointsOf(track).flatMap((s) => s.points));
    const options = this.store.baseLayerOptionsFor(this.journalKey(), bbox);
    const tiles = trackTileSources(options, this.store.selectedBaseLayerFor(this.journalKey(), bbox), this.store.online());
    return { track, summary: trackSummary(track, this.store.i18n.track_untitled()), photos, ...(tiles ? { tiles } : {}) };
  }

  private imageName(image: ImageConfig, index: number): string {
    return imageTitle(image, index, (n) => fill(this.store.i18n.image_photo(), { n }));
  }

  private readonly index = computed(() => this.footprints().findIndex((f) => f.key === this.footprintKey()));
  protected readonly previousKey = computed(() => (this.index() > 0 ? this.footprints()[this.index() - 1].key : undefined));
  protected readonly nextKey = computed(() => {
    const i = this.index();
    return i >= 0 && i < this.footprints().length - 1 ? this.footprints()[i + 1].key : undefined;
  });

  public constructor() {
    registerBundledIcons(JOURNAL_ICONS); // the journal renders its icons offline (spec 1.126)
    void this.store.init();
    // the journal on screen is the one the other iPad syncs with (P2P, plan 5)
    effect(() => {
      const journalKey = this.journalKey();
      untracked(() => void this.store.openJournal(journalKey));
    });
    // the store is a root singleton: a lock's heartbeat keeps running until released, also when the page goes while a modal is open
    inject(DestroyRef).onDestroy(() => {
      for (const entityKey of this.heldLocks) void this.store.releaseLock(this.journalKey(), entityKey);
      this.heldLocks.clear();
    });
  }

  /**
   * The section with its image urls resolved from the journal image keys (`label`): the hero cover, the article and
   * album photos (left out when not shown here, see `sections`) and the video clips with poster and mp4.
   */
  private resolved(section: SectionModel, images: Map<string, ImageView>): { section: SectionModel; clips: VideoClip[]; missing: number } {
    const native = this.store.native();
    const isMissing = (key: string) => !native && this.fileUrl.isMissing(images.get(key)?.path2048);
    const withUrl = (image: ImageConfig): ImageConfig => ({ ...image, url: this.fileUrl.url(images.get(image.label)?.path2048) });
    const properties = { ...(section.properties as unknown as Record<string, unknown>) };
    let missing = 0;
    if (Array.isArray(properties['images'])) {
      const listed = properties['images'] as ImageConfig[];
      missing = listed.filter((image) => isMissing(image.label)).length;
      // a photo without a url yet (Documents URI not known, not received, not uploaded) is left out, never a blank tile
      properties['images'] = listed.map(withUrl).filter((image) => image.url !== '' && !isMissing(image.label));
    }
    const hero = properties['hero'] as ImageConfig | undefined;
    if (section.type === 'hero' && hero?.label) {
      // browser: a cover signed but not in the bucket yet (a draft photo on the iPad) has no url, like the album photos
      const heroMissing = isMissing(hero.label);
      if (heroMissing) missing += 1;
      properties['hero'] = heroMissing ? { ...hero, url: '' } : withUrl(hero);
    }
    let clips: VideoClip[] = [];
    if (section.type === 'video' && Array.isArray(properties['clips'])) {
      // iPad: a file URL is built whether the mp4 is here or not, so presence comes from the store (another author's clip
      // in «Nur hochladen», download pending); browser: the signed value '' marks a clip not uploaded yet
      const present = this.store.presentVideos();
      const clipMissing = (videoPath: string) => (native ? !present[photoFileName(videoPath)] : this.fileUrl.isMissing(videoPath));
      clips = (properties['clips'] as ImageConfig[]).map((c) => images.get(c.label)).filter((i): i is ImageView => i?.videoPath !== undefined)
        .map((i) => {
          const videoPath = i.videoPath as string;
          const src = this.fileUrl.url(videoPath);
          return { key: i.key, poster: this.fileUrl.url(i.path2048), src: src === '' || clipMissing(videoPath) ? '' : src, videoPath, durationSec: i.durationSec };
        });
    }
    return { section: { ...section, properties } as SectionModel, clips, missing };
  }

  /** Entities this page holds a lock on right now. */
  private readonly heldLocks = new Set<string>();

  /**
   * One section/footprint interaction at a time — sheet, editor and save. A fast double tap would otherwise
   * stack two sheets, and two saves from the same opened state would make the first one a conflict copy.
   */
  private busy = false;

  private async exclusive(interaction: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await interaction();
    } finally {
      this.busy = false;
    }
  }

  /** Every author edits every section (spec 1.126 §5) — on the iPad with a bound author, in the browser when signed in as a person. */
  protected canEdit(): boolean {
    return this.store.canWrite();
  }

  /** The name of the person editing this section right now, if somebody else is. */
  protected lockedBy(view: SectionView): string | undefined {
    return this.store.lockOf(view.key)?.name;
  }

  protected onIpad(count: number): string {
    return fill(this.store.i18n.photos_on_ipad(), { count });
  }

  protected uploading(done: number, total: number): string {
    return fill(this.store.i18n.photos_uploading(), { done, total });
  }

  protected fillName(name: string): string {
    return fill(this.store.i18n.section_locked(), { name });
  }

  protected overwritten(field: string, value: unknown): string {
    return fill(this.store.i18n.footprint_overwritten(), lostValueText(field, value, this.store.i18n));
  }

  private async toastText(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, position: 'bottom' });
    await toast.present();
  }

  /**
   * Runs an edit under the lock on `entityKey`. A refused lock shows who is editing and runs nothing;
   * a taken lock is released afterwards whatever happens (save, cancel or error).
   */
  private async withLock(entityKey: string, edit: () => Promise<unknown>): Promise<void> {
    const other = await this.store.acquireLock(this.journalKey(), entityKey);
    if (other) {
      await this.toastText(this.fillName(other.name));
      return;
    }
    this.heldLocks.add(entityKey);
    try {
      await edit();
    } finally {
      this.heldLocks.delete(entityKey);
      await this.store.releaseLock(this.journalKey(), entityKey);
    }
  }

  protected async menu(event: Event): Promise<void> {
    switch (await openJournalMenu(this.popoverController, event, this.menuItems(), this.store.i18n)) {
      case 'toggleEditMode': return this.editMode.update((on) => !on);
      case 'addSection': return this.exclusive(() => this.addSection());
      case 'sortSections': return this.exclusive(() => this.sortSections());
      case 'editFootprint': return this.editFootprint();
      case 'deleteFootprint': return this.confirmDeleteFootprint();
    }
  }

  /**
   * «Sektion hinzufügen»: the CMS card-select with the types the footprint may still get (a hero only while there is
   * none), built here rather than from the `section_type` category, which an offline iPad may not have (decision 5);
   * then the section editor on the new section, and one create record when it is saved.
   */
  private async addSection(): Promise<void> {
    const fp = this.footprint();
    if (!fp) return;
    const tenantId = this.appStore.tenantId();
    const category = new CategoryListModel(tenantId);
    category.name = 'section_type';
    category.i18n = SECTION_TYPE_I18N;
    category.items = addableSectionTypes(fp.sections).map((type) => new CategoryItemModel(type, type));
    const { CardSelectModal } = await import('@okr/cms-section-feature');
    const modal = await this.modalController.create({ component: CardSelectModal, cssClass: 'full-modal', componentProps: { category, slug: 'section' } });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<CategoryItemModel>();
    const type = data?.name;
    if (role !== 'confirm' || !isJournalSectionType(type)) return;
    const section = emptySection(type);
    if (type === 'track') {
      // a track section needs its track first: the picker writes the `track` record before it resolves
      const chosen = await journalTrackPicker(this.injector, this.journalKey(), fp.key).pick();
      if (!chosen) return;
      section.properties = { track: { trackKey: chosen.trackKey } };
    }
    const edited = await this.openSectionEditor(sectionModelOf(section, tenantId));
    if (edited) await this.run(() => this.store.addSection(fp.key, type, edited));
  }

  /** In edit mode a tap on a section opens its ActionSheet (unless somebody else is editing it); outside edit mode a tap does nothing. */
  protected tapSection(view: SectionView): void {
    if (!this.editMode() || !this.canEdit()) return;
    const name = this.lockedBy(view);
    if (name) void this.toastText(this.fillName(name));
    else void this.exclusive(() => this.sectionSheet(view));
  }

  /** The sections below the hero (a hero always stays first, so it is not offered), labelled by title, text or photos. */
  private async sortSections(): Promise<void> {
    const fp = this.footprint();
    const movable = this.sections().map((s) => s.view).filter((s) => s.type !== 'hero');
    if (!fp || movable.length < 2) return;
    const sections: SortableSection[] = movable.map((s) => ({ key: s.key, label: this.sortLabel(s) }));
    const modal = await this.modalController.create({ component: JournalSectionSortModal, componentProps: { sections } });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<string[]>();
    if (role === 'confirm' && data) await this.run(() => this.store.reorderSections(fp.key, data));
  }

  private sortLabel(view: SectionView): string {
    const i18n = this.store.i18n;
    const text = view.title.trim() || htmlToPlainText(view.htmlContent).trim();
    if (text) return text.slice(0, 40);
    const typeName = {
      hero: i18n.section_type_hero, article: i18n.section_type_article, album: i18n.section_type_album, video: i18n.section_type_video,
      map: i18n.section_type_map, track: i18n.section_type_track,
    }[view.type]();
    const model = sectionModelOf(view, '');
    const list = (model.properties as unknown as Record<string, unknown>)[view.type === 'video' ? 'clips' : 'images'];
    const count = Array.isArray(list) ? list.length : 0;
    return count > 0 ? `${typeName} · ${fill(i18n.section_photos_count(), { count })}` : typeName;
  }

  protected go(footprintKey: string | undefined): void {
    if (footprintKey) void this.router.navigate(['/journal', this.journalKey(), footprintKey], { replaceUrl: true });
  }

  private async sectionSheet(view: SectionView): Promise<void> {
    // what the author sees now is what the edit builds on (spec 1.126 §6.1), not what the store holds at save time
    const opened = view;
    const i18n = this.store.i18n;
    const imgix = this.appStore.services.imgixBaseUrl();
    const texts: Record<string, [string, string]> = {
      'section.edit': [i18n.section_edit_action(), 'edit'],
      'section.delete': [i18n.section_delete_action(), 'trash'],
    };
    const actions = sectionActions({ type: view.type, editable: this.canEdit() });
    if (actions.length === 0) return;
    const options = createActionSheetOptions(i18n.section_actions());
    options.buttons.push(
      ...actions.map((a) => createActionSheetButton(a, texts[a][0], imgix, texts[a][1])),
      createActionSheetButton('cancel', i18n.cancel(), imgix, 'cancel'),
    );
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss<{ action: string }>();
    return this.sectionAction(opened, data?.action);
  }

  private sectionAction(opened: SectionView, action: string | undefined): Promise<void> | undefined {
    switch (action) {
      case 'section.edit': return this.withLock(opened.key, () => this.editSection(opened));
      case 'section.delete': return this.confirmDeleteSection(opened.key);
    }
    return undefined;
  }

  /** A reaction chip, «＋» or the quick row: the author's reaction on, or back off. */
  protected react(reaction: FeedbackReaction): void {
    void this.run(() => this.store.toggleReaction(reaction.parentKey, this.footprintKey(), reaction.emoji));
  }

  protected async comment(comment: FeedbackText): Promise<void> {
    this.sending.set(true);
    try {
      await this.run(() => this.store.addComment(comment.parentKey, this.footprintKey(), comment.text));
    } finally {
      this.sending.set(false);
    }
  }

  protected deleteComment(commentKey: string): void {
    void this.run(() => this.store.archiveComment(commentKey));
  }

  /**
   * A tap on an image of an article or album (outside edit mode; in edit mode the tap opens the section's sheet):
   * the image's sheet, with the section's edit actions for authors (spec 1.154 §7).
   */
  protected tapImage(item: StorySection, image: ImageConfig): void {
    void this.exclusive(() => this.imageSheet(item, image));
  }

  private async imageSheet(item: StorySection, image: ImageConfig): Promise<void> {
    const opened = item.view;
    const index = Math.max(0, item.images.findIndex((i) => i.label === image.label));
    const i18n = this.store.i18n;
    const texts: Record<string, [string, string]> = {
      'section.edit': [i18n.section_edit_action(), 'edit'],
      'section.delete': [i18n.section_delete_action(), 'trash'],
    };
    const extra: JournalFeedbackAction[] = sectionActions({ type: opened.type, editable: this.canEdit() })
      .map((a) => ({ id: a, label: texts[a][0], icon: texts[a][1], danger: a === 'section.delete' }));
    const thread = this.thread(imageParentKey(image));
    const choice = await openImageSheet(this.modalController, this.toastController, i18n, { image, index, feedback: item.feedback, thread, canWrite: this.canEdit(), extra });
    if (choice?.kind === 'react') return this.react(toggledReaction(thread.parentKey, thread.reactions, choice.emoji));
    switch (choice?.id) {
      case IMAGE_ACTION.comment:
      case IMAGE_ACTION.comments: return this.openImage.set({ sectionKey: opened.key, image, index });
      case IMAGE_ACTION.slider: return showImageSlider(this.modalController, item.images, { ...IMAGE_STYLE_SHAPE }, index);
      case 'section.edit':
      case 'section.delete': {
        const name = this.lockedBy(opened);
        if (name) return this.toastText(this.fillName(name));
        return this.sectionAction(opened, choice.id);
      }
    }
  }

  /** Edits a section as it was shown when the sheet opened; only the fields the author changed are written. */
  private async editSection(opened: SectionView): Promise<void> {
    const edited = await this.openSectionEditor(sectionModelOf(opened, this.appStore.tenantId()));
    if (edited) await this.run(() => this.store.updateSection(opened.key, edited, opened));
  }

  /**
   * The CMS section editor in journal mode (spec 1.154 §2): only the fields of the change record, no Firestore read,
   * photos and clips from the journal's picker (provided through the modal's injector, so `okr-images-config` in the
   * modal finds it). Roles and states are not shown in journal mode; empty lists keep it offline. Resolves to the
   * edited section, or undefined when the author closed the editor without saving.
   */
  private async openSectionEditor(section: SectionModel): Promise<SectionModel | undefined> {
    const tenantId = this.appStore.tenantId();
    const { SectionEditModal } = await import('@okr/cms-section-feature');
    const modal = await this.modalController.create({
      component: SectionEditModal,
      cssClass: 'full-modal',
      injector: journalSectionPickerInjector(this.injector, this.journalKey(), this.footprintKey()),
      componentProps: {
        section,
        currentUser: this.appStore.currentUser() ?? new UserModel(tenantId),
        roles: new CategoryListModel(tenantId),
        states: new CategoryListModel(tenantId),
        readOnly: false,
        journalMode: true,
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<SectionModel>();
    return role === 'confirm' && data ? data : undefined;
  }

  private async confirmDeleteSection(sectionKey: string): Promise<void> {
    const i18n = this.store.i18n;
    const sheet = await this.actionSheetController.create({
      header: i18n.section_delete_confirm(),
      buttons: [
        { text: i18n.section_delete_action(), role: 'destructive', handler: () => void this.run(() => this.store.archiveSection(sectionKey)) },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async confirmDeleteFootprint(): Promise<void> {
    const i18n = this.store.i18n;
    const footprintKey = this.footprintKey();
    const sheet = await this.actionSheetController.create({
      header: i18n.story_footprint_delete_confirm(),
      buttons: [
        {
          text: i18n.story_footprint_delete(), role: 'destructive',
          handler: () => void this.run(async () => {
            await this.store.archiveFootprint(footprintKey);
            await this.router.navigate(['/journal', this.journalKey()], { replaceUrl: true });
          }),
        },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  protected editFootprint(): Promise<void> {
    return this.exclusive(async () => {
      // the footprint as the modal shows it: the baseline of the changed fields and of their bases
      const fp: FootprintView | undefined = this.footprint();
      if (!fp) return;
      const current: FootprintFormModel = {
        title: fp.title, placeName: fp.placeName, date: fp.date, time: fp.time, published: fp.publishState === 'published', transport: fp.transport ?? '',
      };
      await this.withLock(fp.key, async () => {
        const modal = await this.modalController.create({ component: FootprintEditModal, componentProps: { footprint: current }, cssClass: 'auto-height-modal' });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<FootprintFormModel>();
        if (role === 'confirm' && data) await this.run(() => this.store.saveFootprintForm(fp.key, data, fp));
      });
    });
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
    }
  }
}

/** A section the author is about to add: nothing stored yet (`okey` '' makes the editor offer «save» at once). */
function emptySection(type: JournalSectionType): SectionView {
  return { key: '', type, title: '', htmlContent: '', properties: {}, order: '', authorKey: '', hlcs: {}, conflict: false };
}

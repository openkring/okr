import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonListHeader, IonNote, IonSpinner, IonTitle,
  IonToolbar, ToastController,
} from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { TRANSPORT_MODES, TrackPhoto, TransportMode, TripModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { confirm, downloadFile, okrPrompt } from '@okr/shared-util-angular';
import { queryPedometerSteps, TerrainElevationService, TrackDb, TrackService } from '@okr/mobility-tracker-data-access';
import { TrackElevation, TrackMap, TrackMapPhoto, TrackMapSection, TrackModeChange, TrackPhotoItem, TrackPhotos, TrackPhotoToggle, TrackSections } from '@okr/mobility-tracker-ui';
import { fill } from '@okr/shared-util-core';
import {
  alignSections, buildGpx, ElevationPoint, elevationProfile, hasRelief, needsTerrain, sectionsWithHeights, terrainAltitudes, terrainSamples, logbuchTripLabel, correctedTrack, fromLocalSections, gpxFileName, isShareCancel, LocalSection, LocalTrack, localFromTrip, mergeWithNext,
  localStoreDate, middlePointIndex, sectionRows, setSectionMode, splitSection, toLocalSections, trackTenants, wantsPhotoReattach, withoutPhoto,
  withPhotoHidden, withQueriedSteps,
} from '@okr/mobility-tracker-util';

import { TrackerStore } from './tracker.store';

/**
 * One recorded track (spec 1.121, plan 2 task 9): map, sections with corrections (mode, split, merge), rename,
 * delete and GPX export. A track still on this device is corrected in TrackDb first and then uploaded again
 * (same key: the trip is overwritten); a track that only exists uploaded is rebuilt from the trip and uploaded
 * corrected. Corrections need a finished track.
 * Photos (plan 3 task 6): pins on the map and a strip with hide/show. The picture is the local 400 px rendition when
 * the track and its file are on this device, otherwise the uploaded thumbnail; a photo without either is a dot.
 * A local track searches the library again when it has no photos or was searched under limited access (spec §6
 * «again on demand»), and «Fotos erneut suchen» does it by hand. An uploaded-only track offers «Entfernen» instead of
 * hide/show: hidden photos are never on the server, so one hidden there could not come back.
 */
@Component({
  selector: 'okr-track-detail-page',
  imports: [
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, IonListHeader, IonLabel, IonNote, IonSpinner,
    SvgIconPipe, TrackElevation, TrackMap, TrackPhotos, TrackSections,
  ],
  styles: [`
    .center { display: flex; justify-content: center; padding: 24px; }
    .note { display: block; padding: 8px 16px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tracker" /></ion-buttons>
        <ion-title>{{ track()?.name ?? i18n.page_title() }}</ion-title>
        @if (track()) {
          <ion-buttons slot="end">
            <ion-button [disabled]="busy()" (click)="rename()" [attr.aria-label]="i18n.list_rename()">
              <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" />
            </ion-button>
            <ion-button [disabled]="busy()" (click)="exportGpx()" [attr.aria-label]="i18n.list_share_gpx()">
              <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
            </ion-button>
            <ion-button [disabled]="busy()" (click)="remove()" [attr.aria-label]="i18n.list_delete()">
              <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (loading()) {
        <div class="center"><ion-spinner /></div>
      } @else if (track(); as t) {
        <okr-track-map [sections]="mapSections()" [photos]="mapPhotos()" [live]="false" [highlight]="highlight()" />
        @if (relief(); as profile) {
          <ion-list-header><ion-label>{{ i18n.elevation_title() }}</ion-label></ion-list-header>
          <okr-track-elevation [profile]="profile" [i18n]="i18n" [note]="terrainNote()" (pointed)="highlight.set($event)" />
        }
        @if (!t.uploaded) {
          <ion-note class="note" color="warning">{{ i18n.list_not_uploaded() }}</ion-note>
        }
        @if (isLinked() || isPendingLink()) {
          <ion-note class="note">{{ isLinked() ? linkedText() : i18n.link_pending() }}</ion-note>
          <ion-button fill="clear" size="small" [disabled]="busy()" (click)="unlink()">
            <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />{{ i18n.link_unlink() }}
          </ion-button>
        } @else if (canLink()) {
          <ion-button fill="clear" size="small" [disabled]="busy()" (click)="link()">
            <ion-icon slot="start" src="{{ 'link' | svgIcon }}" />{{ i18n.link_connect() }}
          </ion-button>
        }
        @if (photoItems().length > 0) {
          <ion-list-header><ion-label>{{ i18n.photos_title() }}</ion-label></ion-list-header>
          <okr-track-photos [photos]="photoItems()" [i18n]="i18n" [removable]="!isLocal()" [disabled]="searching()"
            (photoToggle)="togglePhoto($event)" />
        }
        @if (isLocal() && t.state === 'done') {
          <ion-button fill="clear" size="small" [disabled]="searching()" (click)="searchPhotos()">
            <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />{{ i18n.photos_search() }}
          </ion-button>
        }
        @if (photoAccess() === 'limited') {
          <ion-note class="note">{{ i18n.photos_limited() }}</ion-note>
        } @else if (photoAccess() === 'denied' && photoItems().length === 0) {
          <ion-note class="note">{{ i18n.photos_denied() }}</ion-note>
        }
        <ion-list-header><ion-label>{{ i18n.detail_sections() }}</ion-label></ion-list-header>
        @if (editable()) {
          <okr-track-sections [sections]="rows()" [pointCounts]="pointCounts()" [i18n]="i18n"
            (modeChanged)="changeMode($event)" (split)="split($event.index)" (merge)="merge($event.index)" />
        } @else {
          <okr-track-sections [sections]="rows()" [pointCounts]="[]" [i18n]="i18n" />
        }
      } @else {
        <ion-note class="note">{{ i18n.detail_not_found() }}</ion-note>
      }
    </ion-content>
  `,
})
export class TrackDetailPage {
  public readonly key = input.required<string>();

  private readonly store = inject(TrackerStore);
  protected readonly i18n = this.store.i18n;
  private readonly db = inject(TrackDb);
  private readonly trackService = inject(TrackService);
  private readonly appStore = inject(AppStore);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly terrainService = inject(TerrainElevationService);

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly track = signal<LocalTrack | undefined>(undefined);
  protected readonly sections = signal<LocalSection[]>([]);
  /** true when the track is (also) in TrackDb on this device. */
  protected readonly isLocal = signal(false);
  /** a library search («Fotos erneut suchen» or the automatic one) is running */
  protected readonly searching = signal(false);
  /** The uploaded trip, when one was found. */
  private readonly trip = signal<TripModel | undefined>(undefined);

  /** Linked to a Logbuch trip (spec 1.123 §4): the link transaction succeeded. */
  protected readonly isLinked = computed(() => {
    const t = this.track();
    return !!t?.logbuchKey && !!t.logbuchLinked && t.state === 'done';
  });
  /** A link from the start still waiting for its transaction (offline): it can be dropped, so it is never a dead end. */
  protected readonly isPendingLink = computed(() => {
    const t = this.track();
    return !!t?.logbuchKey && !t.logbuchLinked && t.state === 'done';
  });
  /**
   * «Mit Logbuch-Ausfahrt verbinden»: an own, finished recording without a link (a link still pending from the start
   * is retried by the store). Crew copies (`track.copyOf`) are never linked.
   */
  protected readonly canLink = computed(() => {
    const t = this.track();
    return !!t && t.state === 'done' && !t.logbuchKey && !this.trip()?.track?.copyOf;
  });
  /** The linked Logbuch trip, read for its boat and time. */
  private readonly linkedTrip = signal<TripModel | undefined>(undefined);
  protected readonly linkedText = computed(() => {
    const lb = this.linkedTrip();
    return lb ? fill(this.i18n.link_linked(), { trip: this.tripLabel(lb) }) : this.i18n.link_linked_unknown();
  });

  /**
   * Terrain heights (spec 1.128 §2) for exactly these `sections` (a correction makes a new array and so a new lookup);
   * only used when too few points carry a GPS altitude.
   */
  private readonly terrain = signal<{ sections: LocalSection[]; alts: (number | undefined)[][]; provider: string } | undefined>(undefined);
  /** the sections a terrain lookup was started for: one lookup per sections array */
  private terrainRequested?: LocalSection[];
  /** the sections with the heights to show and export: GPS, or terrain when GPS is too sparse */
  private readonly heightSections = computed(() => {
    const t = this.terrain();
    const sections = this.sections();
    return sectionsWithHeights(sections, t?.sections === sections ? t.alts : undefined);
  });
  /** the height profile, only when it has relief (> 20 m) */
  protected readonly relief = computed(() => {
    const p = elevationProfile(this.heightSections());
    return hasRelief(p) ? p : undefined;
  });
  protected readonly terrainNote = computed(() => {
    const t = this.terrain();
    return t?.sections === this.sections() && needsTerrain(this.sections()) && t.provider
      ? fill(this.i18n.elevation_terrain(), { provider: t.provider }) : '';
  });
  /** the profile point under the finger, marked on the map */
  protected readonly highlight = signal<ElevationPoint | undefined>(undefined);

  protected readonly editable = computed(() => this.track()?.state === 'done' && !this.busy());
  protected readonly mapSections = computed<TrackMapSection[]>(() => this.sections().map((s) => ({ mode: s.mode, points: s.points })));
  protected readonly rows = computed(() => sectionRows(this.sections()));
  protected readonly pointCounts = computed(() => this.sections().map((s) => s.points.length));
  protected readonly photoAccess = this.store.photoAccess;
  /** The track's photos: the local list for a track on this device, else the uploaded trip's. */
  private readonly photos = computed<(TrackPhoto & { path400?: string })[]>(() =>
    (this.isLocal() ? this.track()?.photos : this.trip()?.track?.photos) ?? []);
  /** Displayable picture per photo (by assetId), filled asynchronously. */
  private readonly photoSrcs = signal<ReadonlyMap<string, string>>(new Map());
  /** Source keys already being resolved (assetId + path400 + thumbPath): a new thumbPath resolves again. */
  private readonly resolving = new Set<string>();
  protected readonly mapPhotos = computed<TrackMapPhoto[]>(() => {
    const srcs = this.photoSrcs();
    return this.photos().map((p) => ({ lat: p.lat, lng: p.lng, hidden: p.hidden, src: srcs.get(p.assetId) }));
  });
  protected readonly photoItems = computed<TrackPhotoItem[]>(() => {
    const srcs = this.photoSrcs();
    return this.photos().map((p) => ({ takenAt: p.takenAt, hidden: p.hidden, src: srcs.get(p.assetId) }));
  });

  public constructor() {
    effect(() => {
      const key = this.key();
      untracked(() => void this.load(key));
    });
    // heights from the terrain model for a Strecke without (enough) GPS altitude, once per sections array
    effect(() => {
      const sections = this.sections();
      const loading = this.loading();
      untracked(() => {
        if (!loading) void this.ensureTerrain(this.key(), sections);
      });
    });
    effect(() => {
      const logbuchKey = this.isLinked() ? this.track()?.logbuchKey : undefined;
      untracked(() => void this.loadLinkedTrip(logbuchKey));
    });
    effect(() => {
      const photos = this.photos();
      const local = this.isLocal();
      untracked(() => {
        for (const p of photos) void this.resolvePhotoSrc(p, local);
      });
    });
  }

  /**
   * Hide or show one photo. A local track goes through TrackerStore.setPhotoHidden (TrackDb on the queue, then a
   * detached re-upload; a photo shown again gets its thumbnail after that). An uploaded-only track writes the photo
   * list detached — no thumbnail can be made there, so a photo that never had one stays a dot. Hidden photos are not
   * on the server, so there «Entfernen» (after a confirm) drops the photo from the list and deletes its thumbnail.
   */
  protected async togglePhoto(change: TrackPhotoToggle): Promise<void> {
    const t = this.track();
    if (!t || this.busy()) return;
    const key = t.key;
    if (this.isLocal()) {
      if (this.searching()) return; // the strip is disabled meanwhile: a merge search re-sorts the list
      const before = t.photos ?? [];
      // the index is the strip's position right now; from here on the photo is named by its assetId
      const assetId = before[change.index]?.assetId;
      if (!assetId) return;
      const next = withPhotoHidden(before, assetId, change.hidden);
      if (next === before) return;
      this.track.set({ ...t, photos: next });
      try {
        if (!(await this.store.setPhotoHidden(key, assetId, change.hidden))) throw new Error('photo change not written');
        const written = (await this.db.list()).find((x) => x.key === key);
        if (written && this.track()?.key === key) this.track.set(written);
      } catch (error) {
        console.error('TrackDetailPage.togglePhoto', error);
        await this.toast(this.i18n.detail_save_error());
        await this.reloadLocal(key);
      }
      return;
    }
    if (!change.hidden) return; // uploaded-only: a photo can only be removed
    const ok = await confirm(this.alertController, this.i18n.photos_remove_confirm(), this.i18n.photos_remove(), this.i18n.common_cancel(), true);
    if (!ok) return;
    const trip = this.trip();
    const before = trip?.track?.photos;
    if (!trip?.track || !before || trip.okey !== key) return;
    const removed = before[change.index];
    const next = withoutPhoto(before, change.index);
    if (!removed || next === before) return;
    this.trip.set({ ...trip, track: { ...trip.track, photos: next } });
    void this.trackService.setPhotos(key, next)
      .then(() => {
        // the list no longer points at it: only now the file goes (a failed write keeps photo and thumbnail)
        if (removed.thumbPath) {
          void this.trackService.deleteThumb(removed.thumbPath).catch((error: unknown) => console.error('TrackDetailPage.deleteThumb', error));
        }
      })
      .catch(async (error: unknown) => {
        console.error('TrackDetailPage.setPhotos', error);
        const now = this.trip();
        if (now?.okey === key && now.track) this.trip.set({ ...now, track: { ...now.track, photos: before } });
        await this.toast(this.i18n.detail_save_error());
      });
  }

  /**
   * Links this finished recording to an overlapping Logbuch trip the person was on (spec 1.123 §4.2): the candidates
   * are offered in a choice (also a single one: the person confirms which outing). Needs the network.
   */
  protected async link(): Promise<void> {
    const t = this.track();
    const personKey = this.appStore.currentUser()?.personKey;
    if (!t || !personKey || this.busy()) return;
    this.busy.set(true);
    try {
      const trips = await this.trackService.findMyLogbuchTripsOverlapping(personKey, this.appStore.tenantId(), t.startedAt, t.endedAt ?? t.startedAt);
      if (trips.length === 0) {
        await this.toast(this.i18n.link_none_found());
        return;
      }
      const chosen = await this.chooseLogbuch(trips);
      if (!chosen || this.key() !== t.key) return;
      const result = await this.store.linkLogbuch(t.key, chosen);
      if (!result.ok) {
        await this.toast(result.recorderName ? fill(this.i18n.link_taken(), { name: result.recorderName }) : this.i18n.link_unavailable());
        return;
      }
      await this.showLink(t.key, chosen);
      await this.toast(this.i18n.link_done());
    } catch (error) {
      console.error('TrackDetailPage.link', error);
      await this.toast(this.i18n.link_offline());
    } finally {
      this.busy.set(false);
    }
  }

  /** «Verbindung zum Logbuch lösen» after a confirm: the crew no longer sees the recording. Needs the network. */
  protected async unlink(): Promise<void> {
    const t = this.track();
    if (!t?.logbuchKey || this.busy()) return;
    const ok = await confirm(this.alertController, this.i18n.link_unlink_confirm(), this.i18n.link_unlink(), this.i18n.common_cancel(), true);
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.store.unlinkLogbuch(t.key, t.logbuchKey);
      await this.showLink(t.key, undefined);
    } catch (error) {
      console.error('TrackDetailPage.unlink', error);
      await this.toast(this.i18n.link_offline());
    } finally {
      this.busy.set(false);
    }
  }

  /** The page after a link change: a local track from TrackDb, an uploaded-only one patched in place. */
  private async showLink(key: string, logbuch: TripModel | undefined): Promise<void> {
    if (this.key() !== key) return;
    if (this.isLocal()) {
      await this.reloadLocal(key);
      return;
    }
    const t = this.track();
    if (!t) return;
    const next: LocalTrack = { ...t };
    if (logbuch) {
      next.logbuchKey = logbuch.okey;
      next.logbuchLinked = true;
      if (logbuch.resource) next.resource = logbuch.resource;
    } else {
      delete next.logbuchKey;
      delete next.logbuchLinked;
    }
    this.track.set(next);
    this.trip.update((trip) => {
      if (!trip?.track) return trip;
      const track = { ...trip.track };
      if (logbuch) track.logbuchKey = logbuch.okey;
      else delete track.logbuchKey;
      return { ...trip, track, ...(logbuch?.resource ? { resource: logbuch.resource } : {}) };
    });
    if (logbuch) this.linkedTrip.set(logbuch);
  }

  /** The Logbuch trip to link to: a radio choice, the first one checked. */
  private async chooseLogbuch(trips: TripModel[]): Promise<TripModel | undefined> {
    const alert = await this.alertController.create({
      header: this.i18n.link_choose_title(),
      inputs: trips.map((trip, i) => ({ type: 'radio' as const, label: this.tripLabel(trip), value: trip.okey, checked: i === 0 })),
      buttons: [
        { text: this.i18n.common_cancel(), role: 'cancel' },
        { text: this.i18n.link_connect(), role: 'confirm' },
      ],
    });
    await alert.present();
    const { data, role } = await alert.onWillDismiss<{ values?: string }>();
    return role === 'confirm' ? trips.find((trip) => trip.okey === data?.values) : undefined;
  }

  private tripLabel(trip: TripModel): string {
    return logbuchTripLabel(trip);
  }

  /** Reads the linked Logbuch trip for its label; offline or gone, the label says «Mit einer Logbuch-Ausfahrt verbunden». */
  private async loadLinkedTrip(logbuchKey: string | undefined): Promise<void> {
    if (!logbuchKey) {
      this.linkedTrip.set(undefined);
      return;
    }
    if (this.linkedTrip()?.okey === logbuchKey) return;
    try {
      const trip = await this.trackService.readLogbuch(logbuchKey);
      if (this.track()?.logbuchKey === logbuchKey) this.linkedTrip.set(trip);
    } catch (error) {
      console.error('TrackDetailPage.loadLinkedTrip', error);
    }
  }

  /** «Fotos erneut suchen»: merges newly found photos into the local track (TrackerStore.reattachPhotos). */
  protected async searchPhotos(): Promise<void> {
    const t = this.track();
    if (!t || !this.isLocal() || this.searching()) return;
    const added = await this.reattach(t.key);
    const access = this.photoAccess();
    if (access !== 'full' && access !== 'limited') {
      await this.toast(this.i18n.photos_denied()); // denied, never asked, or the web: nothing could be searched
      return;
    }
    if (added === 0) await this.toast(this.i18n.photos_search_none());
    else if (added === 1) await this.toast(this.i18n.photos_search_added_one());
    else await this.toast(this.i18n.photos_search_added().replace('{count}', String(added)));
  }

  /** Runs the merge search and shows what TrackDb holds afterwards; one search at a time. */
  private async reattach(key: string): Promise<number> {
    this.searching.set(true);
    try {
      const added = await this.store.reattachPhotos(key);
      if (this.key() === key) await this.reloadLocal(key);
      return added;
    } finally {
      this.searching.set(false);
    }
  }

  protected changeMode(change: TrackModeChange): Promise<void> {
    return this.save(setSectionMode(this.sections(), change.index, change.mode));
  }

  protected async split(index: number): Promise<void> {
    const section = this.sections()[index];
    if (!section) return;
    const pointIndex = middlePointIndex(section.points.length);
    if (pointIndex < 0) return;
    const mode = await this.chooseMode(section.mode);
    if (!mode) return;
    await this.save(splitSection(this.sections(), index, pointIndex, mode));
  }

  protected merge(index: number): Promise<void> {
    return this.save(mergeWithNext(this.sections(), index));
  }

  protected async rename(): Promise<void> {
    const current = this.track()?.name ?? '';
    const name = await okrPrompt(this.alertController, this.i18n.list_rename(), this.i18n.list_rename_prompt(), this.i18n.common_save(), this.i18n.common_cancel(), current);
    const trimmed = name?.trim();
    if (!trimmed || trimmed === current) return;
    await this.save(this.sections(), trimmed);
  }

  /** GPX 1.1 of the track: the share sheet in the app (via the cache directory), a download in the browser. */
  protected async exportGpx(): Promise<void> {
    const t = this.track();
    if (!t) return;
    const url = URL.createObjectURL(new Blob([buildGpx(t.name, this.heightSections())], { type: 'application/gpx+xml' }));
    try {
      await downloadFile(url, gpxFileName(t.name));
    } catch (error) {
      if (isShareCancel(error)) return; // the share sheet was just closed
      console.error('TrackDetailPage.exportGpx', error);
      await this.toast(this.i18n.detail_share_error());
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Delete = archive the uploaded trip (single-person, single-tenant: deleting-models) and drop the local copy.
   * The local copy goes at once and the page closes; the archive write resolves only on the server's ack, so it
   * runs detached (a trip that was never uploaded counts as deleted). A finished track is always archived: its
   * upload may have started although `uploaded` is not set yet.
   */
  protected async remove(): Promise<void> {
    const t = this.track();
    if (!t || this.busy()) return;
    const ok = await confirm(this.alertController, this.i18n.list_delete_confirm(), this.i18n.list_delete(), this.i18n.common_cancel(), true);
    if (!ok) return;
    this.busy.set(true);
    try {
      if (t.state === 'done' || !this.isLocal()) {
        const tenants = this.trip()?.tenants;
        void this.store.archiveTrack(t.key, tenants).catch(async (error: unknown) => {
          console.error('TrackDetailPage.archive', error);
          await this.toast(this.i18n.detail_save_error());
        });
      }
      if (this.isLocal()) await this.store.removeLocal(t.key);
      void this.router.navigate(['/tracker']);
    } catch (error) {
      console.error('TrackDetailPage.remove', error);
      await this.toast(this.i18n.detail_save_error());
    } finally {
      this.busy.set(false);
    }
  }

  private async load(key: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.store.init();
      const access = this.store.checkPhotoAccess();
      this.trip.set(undefined);
      this.terrain.set(undefined);
      this.terrainRequested = undefined;
      this.highlight.set(undefined);
      this.photoSrcs.set(new Map());
      this.resolving.clear();
      const local = (await this.db.list()).find((t) => t.key === key);
      if (local) {
        // the local copy shows at once; the uploaded trip (only needed for its tenants on delete) follows detached —
        // listMine waits for the network, so it must never hold up a track that is right here on the device
        const points = alignSections(await this.db.points(key), local.sections.length);
        const strokes = await this.db.strokes(key);
        this.isLocal.set(true);
        this.track.set(local);
        this.sections.set(toLocalSections(local, points, strokes));
        void this.findTrip(key).then((trip) => {
          if (this.key() === key) this.trip.set(trip);
        });
        // spec §6 «again on demand»: no photos yet, or found under limited access — search again, detached
        void access.then((a) => {
          if (this.key() === key && wantsPhotoReattach(local, a) && !this.searching()) void this.reattach(key);
        });
        return;
      }
      const trip = await this.findTrip(key);
      this.trip.set(trip);
      if (trip?.track) {
        const read = await Promise.all(trip.track.sections.map((_, n) => this.trackService.readSection(key, n)));
        const { track, sections } = localFromTrip(trip, read.map((r) => r.points), read.map((r) => r.strokeTimes));
        this.isLocal.set(false);
        this.track.set(track);
        this.sections.set(sections);
        // terrain heights looked up on an earlier view (spec 1.128): no second lookup
        if (read.every((r) => r.terrain)) {
          this.terrain.set({ sections, alts: read.map((r) => r.terrain ?? []), provider: read.find((r) => r.terrainProvider)?.terrainProvider ?? '' });
        }
      } else {
        this.track.set(undefined);
        this.sections.set([]);
      }
    } catch (error) {
      console.error('TrackDetailPage.load', error);
      this.track.set(undefined);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Looks the terrain heights up when the GPS heights are too sparse (spec 1.128 §2) and, for an uploaded Strecke of
   * the owner, stores them on its track-points docs (detached). Offline or failed: no profile, nothing else changes.
   */
  private async ensureTerrain(key: string, sections: LocalSection[]): Promise<void> {
    if (this.terrain()?.sections === sections || this.terrainRequested === sections || !needsTerrain(sections)) return;
    const samples = terrainSamples(sections);
    if (samples.length < 2) return;
    this.terrainRequested = sections;
    try {
      const res = await this.terrainService.heights(samples.map((s) => ({ lat: s.lat, lng: s.lng })));
      if (this.key() !== key || this.sections() !== sections) return;
      const alts = terrainAltitudes(sections, samples, res.alts);
      const provider = res.attribution?.provider ?? '';
      this.terrain.set({ sections, alts, provider });
      // only the uploaded copy of exactly these points: a local track not uploaded yet has no docs to write to
      const trip = this.trip();
      if (trip?.okey === key && (!this.isLocal() || this.track()?.uploaded)) {
        void this.trackService.saveTerrainAltitudes(key, alts, provider)
          .catch((error: unknown) => console.warn('TrackDetailPage.saveTerrainAltitudes', error));
      }
    } catch (error) {
      console.warn('TrackDetailPage.ensureTerrain', error);
      if (this.terrainRequested === sections) this.terrainRequested = undefined; // a later view may try again
    }
  }

  /** The local 400 px file when the track and the file are on this device, else the uploaded thumbnail (if any). */
  private async resolvePhotoSrc(p: TrackPhoto & { path400?: string }, local: boolean): Promise<void> {
    const sourceKey = `${p.assetId}|${local ? p.path400 ?? '' : ''}|${p.thumbPath ?? ''}`;
    if (this.resolving.has(sourceKey)) return;
    this.resolving.add(sourceKey);
    const trackKey = this.key();
    let src: string | undefined;
    try {
      if (local && p.path400 && Capacitor.isNativePlatform() && (await this.trackService.hasLocalFile(p.path400))) {
        src = Capacitor.convertFileSrc(p.path400);
      } else if (p.thumbPath) {
        src = await this.trackService.readThumb(p.thumbPath);
      }
    } catch (error) {
      console.error('TrackDetailPage.resolvePhotoSrc', error);
      this.resolving.delete(sourceKey); // a failed read may be retried on the next photo change
    }
    if (!src || this.key() !== trackKey) return;
    const resolved = src;
    this.photoSrcs.update((m) => new Map(m).set(p.assetId, resolved));
  }

  private async findTrip(key: string): Promise<TripModel | undefined> {
    const personKey = this.appStore.currentUser()?.personKey;
    if (!personKey) return undefined;
    try {
      return (await firstValueFrom(this.trackService.listMine(personKey))).find((t) => t.okey === key);
    } catch {
      return undefined;
    }
  }

  /**
   * Writes a corrected (or renamed) track and uploads it again under the same key. A local track goes through
   * TrackerStore.correct (on the store's queue: TrackDb first, then a detached upload; offline it waits and init()
   * retries). An uploaded-only track is rebuilt from the trip and uploaded detached (Firestore resolves only on
   * the server's ack); docs beyond the new section count are deleted in that upload's batch.
   */
  private async save(next: LocalSection[], name?: string): Promise<void> {
    const before = this.track();
    const beforeSections = this.sections();
    if (!before || this.busy() || before.state !== 'done') return;
    if (next === beforeSections && name === undefined) return; // the correction changed nothing
    // re-read the steps of foot sections within the pedometer history; elsewhere the corrected values stand (spec 1.122)
    this.busy.set(true); // no second correction while the pedometer answers
    try {
      next = await withQueriedSteps(next, queryPedometerSteps, Date.now());
    } finally {
      this.busy.set(false);
    }
    const key = before.key;
    if (this.isLocal()) {
      this.busy.set(true);
      this.track.set(correctedTrack(before, next, name));
      this.sections.set(next);
      try {
        if (!(await this.store.correct(key, next, name))) throw new Error('correction not written');
        const written = (await this.db.list()).find((t) => t.key === key);
        if (written) this.track.set(written);
      } catch (error) {
        console.error('TrackDetailPage.save', error);
        await this.toast(this.i18n.detail_save_error());
        await this.reloadLocal(key); // show what TrackDb really holds
      } finally {
        this.busy.set(false);
      }
      return;
    }
    const owner = this.owner();
    if (!owner) {
      await this.toast(this.i18n.detail_save_error());
      return;
    }
    const oldCount = Math.max(before.sections.length, this.trip()?.track?.sections.length ?? 0);
    const corrected = fromLocalSections({ ...before, name: name ?? before.name }, next);
    this.track.set(corrected.track);
    this.sections.set(next);
    this.trip.update((t) => (t?.track ? { ...t, name: corrected.track.name, track: { ...t.track, sections: t.track.sections.slice(0, next.length) } } : t));
    // stale track-points docs (fewer sections than before) are deleted in the upload's own batch
    void this.trackService.upload(corrected.track, corrected.points, owner, oldCount, corrected.strokes)
      .catch(async (error: unknown) => {
        console.error('TrackDetailPage.upload', error);
        if (this.track()?.key === key) {
          this.track.set(before);
          this.sections.set(beforeSections);
        }
        await this.toast(this.i18n.detail_save_error());
      });
  }

  private async reloadLocal(key: string): Promise<void> {
    try {
      const local = (await this.db.list()).find((t) => t.key === key);
      if (!local) return;
      this.track.set(local);
      this.sections.set(toLocalSections(local, alignSections(await this.db.points(key), local.sections.length), await this.db.strokes(key)));
    } catch (error) {
      console.error('TrackDetailPage.reloadLocal', error);
    }
  }

  private owner(): { personKey: string; uid: string; tenants: string[] } | undefined {
    const personKey = this.appStore.currentUser()?.personKey;
    const uid = this.appStore.fbUser()?.uid;
    if (!personKey || !uid) return undefined;
    // an already uploaded trip keeps its tenants; a local-only one resolves them from the diary targets
    const existing = this.trip()?.tenants;
    const startedAt = this.track()?.startedAt;
    const tenants = existing && existing.length > 0 ? existing : trackTenants(this.appStore.tenantId(), this.appStore.currentUser()?.diaryTargets, localStoreDate(startedAt ?? Date.now()));
    return { personKey, uid, tenants };
  }

  /** The transport mode of the second half of a split (any but the current one). */
  private async chooseMode(current: TransportMode): Promise<TransportMode | undefined> {
    const alert = await this.alertController.create({
      header: this.i18n.section_split_mode(),
      inputs: TRANSPORT_MODES.filter((m) => m !== current).map((m, i) => ({
        type: 'radio' as const, label: this.i18n[`mode_${m}`](), value: m, checked: i === 0,
      })),
      buttons: [
        { text: this.i18n.common_cancel(), role: 'cancel' },
        { text: this.i18n.section_split(), role: 'confirm' },
      ],
    });
    await alert.present();
    const { data, role } = await alert.onWillDismiss<{ values?: TransportMode }>();
    return role === 'confirm' ? data?.values : undefined;
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000 });
    await toast.present();
  }
}

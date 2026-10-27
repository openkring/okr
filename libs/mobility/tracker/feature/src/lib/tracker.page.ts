import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel,
  IonList, IonListHeader, IonNote, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar, AlertController,
} from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { of, switchMap } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { TRANSPORT_MODES, TransportMode, TripModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { listCalibrationFiles, readCalibrationCsv, shareCalibration, TrackDb, TrackerLocation, TrackService } from '@okr/mobility-tracker-data-access';
import { TrackerBanner, TrackMap, TrackMapSection } from '@okr/mobility-tracker-ui';
import {
  calibrationStartedAt, parseCalibrationCsv, StrokeDetector, elapsedSeconds, figureTexts, formatKm, isShareCancel, LocalTrack, localStoreDate, logbuchTripLabel, mergeTrackLists, pickLogbuchPreset,
  TrackPoint,
} from '@okr/mobility-tracker-util';
import { fill, hasRole } from '@okr/shared-util-core';
import { okrPrompt } from '@okr/shared-util-angular';

import { TrackerStore } from './tracker.store';

/** The live map reloads the active track's points from TrackDb at most this often. */
const LIVE_REFRESH_MS = 2000;
const AUTO = 'auto';
type ModeChoice = TransportMode | typeof AUTO;

/**
 * The tracker (spec 1.121, plan 2 task 9): a start card (or the resume prompt), the banner and a live map while
 * recording, and «Meine Strecken» — local tracks still waiting for an upload first, then the uploaded ones.
 */
@Component({
  selector: 'okr-tracker-page',
  imports: [
    IonHeader, IonToggle, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonSelect,
    IonSelectOption, IonButton, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonIcon, IonChip, SvgIconPipe, TrackerBanner, TrackMap,
  ],
  styles: [`
    .warning { display: block; margin-top: 8px; }
    .error { display: block; padding: 8px 16px; }
    .logbuch { margin: 0 0 8px 0; }
    okr-track-map { --okr-track-map-height: max(240px, 40vh); }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/journal" /></ion-buttons>
        <ion-title>{{ i18n.page_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.active(); as active) {
        <okr-tracker-banner [mode]="store.currentMode() ?? 'foot'" [distanceM]="store.distanceM()" [durationS]="durationS()"
          [state]="active.state === 'recording' ? 'recording' : 'paused'" [proposal]="store.proposal()" [i18n]="i18n" [figure]="liveFigure()"
          (pauseTap)="store.pause()" (resumeTap)="store.resume()" (stop)="stop()" (modeChange)="store.changeMode($event)"
          (acceptProposal)="store.acceptProposal()" (dismissProposal)="store.dismissProposal()" />
        <okr-track-map [sections]="liveSections()" [live]="true" />
      } @else if (store.resumable(); as resumable) {
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n.resume_title() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <p>{{ resumable.name }}</p>
            <ion-button (click)="resumeRecording()">
              <ion-icon slot="start" src="{{ 'play' | svgIcon }}" />{{ i18n.resume_continue() }}
            </ion-button>
            <ion-button fill="outline" (click)="finishResumable()">
              <ion-icon slot="start" src="{{ 'stop' | svgIcon }}" />{{ i18n.resume_finish() }}
            </ion-button>
          </ion-card-content>
        </ion-card>
      } @else {
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n.start_title() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <ion-list lines="none">
              <ion-item>
                <ion-select interface="popover" [label]="i18n.start_mode()" labelPlacement="stacked"
                  [value]="mode()" (ionChange)="mode.set($event.detail.value)">
                  <ion-select-option [value]="auto">{{ i18n.start_detect() }}</ion-select-option>
                  @for (m of modes; track m) {
                    <ion-select-option [value]="m">{{ modeLabel(m) }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              @if (presetTrips().length > 1) {
                <ion-item>
                  <ion-select interface="popover" [label]="i18n.link_choose()" labelPlacement="stacked"
                    [value]="selectedLogbuch()?.okey ?? ''" (ionChange)="chooseLogbuch($event.detail.value)">
                    <ion-select-option value="">{{ i18n.link_without() }}</ion-select-option>
                    @for (t of presetTrips(); track t.okey) {
                      <ion-select-option [value]="t.okey">{{ tripLabel(t) }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              }
            </ion-list>
            @if (presetTrips().length <= 1 && selectedLogbuch(); as lb) {
              <ion-chip class="logbuch" color="primary" (click)="chooseLogbuch('')" [attr.aria-label]="i18n.link_remove()">
                <ion-icon src="{{ 'boat' | svgIcon }}" />
                <ion-label>{{ presetText(lb) }}</ion-label>
                <ion-icon src="{{ 'cancel' | svgIcon }}" />
              </ion-chip>
            }
            <ion-button expand="block" [disabled]="starting() || store.warning() === 'notNative'" (click)="start()">
              <ion-icon slot="start" src="{{ 'recording' | svgIcon }}" />{{ i18n.start_start() }}
            </ion-button>
            @if (warningText(); as warning) {
              <ion-note class="warning" color="warning">{{ warning }}</ion-note>
              @if (showSettingsHint()) {
                <ion-note class="warning">{{ i18n.warning_open_settings() }}</ion-note>
              }
            }
          </ion-card-content>
        </ion-card>
      }
      @if (store.uploadError()) {
        <ion-note class="error" color="danger">{{ i18n.upload_error() }}</ion-note>
      }
      <ion-list>
        <ion-list-header><ion-label>{{ i18n.list_title() }}</ion-label></ion-list-header>
        @for (item of items(); track item.key) {
          <ion-item button detail="true" (click)="open(item.key)">
            <ion-label>
              <h3>{{ item.name }}</h3>
              <p>{{ dateText(item.startedAt) }}@if (item.distanceM !== undefined) { · {{ km(item.distanceM) }} }</p>
              @if (item.needsUpload) {
                <ion-note color="warning">{{ i18n.list_not_uploaded() }}</ion-note>
              }
            </ion-label>
            @if (item.needsUpload) {
              <ion-button slot="end" fill="clear" [disabled]="retrying() === item.key" (click)="retry($event, item.key)">
                <ion-icon slot="start" src="{{ 'upload' | svgIcon }}" />{{ i18n.list_retry_upload() }}
              </ion-button>
            }
          </ion-item>
        } @empty {
          <ion-item lines="none"><ion-label color="medium">{{ i18n.list_empty() }}</ion-label></ion-item>
        }
      </ion-list>
      @if (showCalibration()) {
        <ion-list>
          <ion-list-header><ion-label>{{ i18n.calibration_title() }}</ion-label></ion-list-header>
          <ion-item>
            <ion-toggle [checked]="store.calibrating()" (ionChange)="setCalibration($event.detail.checked)">{{ i18n.calibration_toggle() }}</ion-toggle>
          </ion-item>
          @for (file of calibrationFiles(); track file) {
            <ion-item>
              <ion-label>{{ calibrationLabel(file) }}</ion-label>
              <ion-button slot="end" fill="clear" (click)="checkCalibrationFile(file)">{{ i18n.calibration_check() }}</ion-button>
              <ion-button slot="end" fill="clear" (click)="shareCalibrationFile(file)">{{ i18n.calibration_share() }}</ion-button>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-label color="medium">{{ i18n.calibration_empty() }}</ion-label></ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class TrackerPage {
  /** Query param `logbuch` (the push «Strecke aufzeichnen?», spec 1.123 §4.1): the Logbuch trip to preselect. */
  public readonly logbuch = input<string>();

  protected readonly store = inject(TrackerStore);
  protected readonly i18n = this.store.i18n;
  private readonly db = inject(TrackDb);
  private readonly trackService = inject(TrackService);
  private readonly appStore = inject(AppStore);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);

  protected readonly modes = TRANSPORT_MODES;
  protected readonly auto = AUTO;
  protected readonly mode = signal<ModeChoice>(AUTO);
  protected readonly starting = signal(false);
  protected readonly retrying = signal<string | undefined>(undefined);

  // banner duration: start of the active track until now, ticking once a second while recording
  private readonly now = signal(Date.now());
  protected readonly durationS = computed(() => {
    const active = this.store.active();
    return active ? elapsedSeconds(active.startedAt, this.now()) : 0;
  });

  protected readonly warningText = computed(() => {
    const w = this.store.warning();
    return w === 'none' ? '' : this.i18n[`warning_${w}`]();
  });
  /** steps so far on foot, the current split on row (spec 1.122) */
  protected readonly liveFigure = computed(() => {
    const mode = this.store.currentMode();
    const f = mode === 'foot'
      ? { steps: this.store.liveSteps() }
      : mode === 'row' ? { strokes: this.store.liveStrokes(), strokeRateAvg: this.store.liveStrokeRate(), splitAvgS: this.store.liveSplitS() } : {};
    // row: «812 Schläge · 24/min · 2:05 /500 m»
    return figureTexts(f, {
      steps: this.i18n.figure_steps(), splitAvg: '{split}', splitBest: '', strokes: this.i18n.figure_strokes(), rateAvg: this.i18n.figure_rate(),
    }).join(' · ');
  });
  /** admin-only raw-motion recording for tuning the stroke detector (spec 1.122 §5.2); needs the native app */
  protected readonly showCalibration = computed(() => Capacitor.isNativePlatform() && hasRole('admin', this.appStore.currentUser()));
  protected readonly calibrationFiles = signal<string[]>([]);
  protected readonly showSettingsHint = computed(() => this.store.warning() === 'whenInUseOnly' || this.store.warning() === 'locationDenied');

  // live map of the active track
  private readonly livePoints = signal<TrackPoint[][]>([]);
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private lastRefresh = 0;
  /** false after ionViewDidLeave (another page on top) until ionViewWillEnter. */
  private entered = true;
  protected readonly liveSections = computed<TrackMapSection[]>(() => {
    const points = this.livePoints();
    return (this.store.active()?.sections ?? []).map((s, i) => ({ mode: s.mode, points: points[i] ?? [] }));
  });

  // «Meine Strecken»
  private readonly localTracks = signal<LocalTrack[]>([]);
  private readonly personKey = computed(() => this.appStore.currentUser()?.personKey);
  private readonly uploaded = toSignal(
    toObservable(this.personKey).pipe(switchMap((pk) => (pk ? this.trackService.listMine(pk) : of([] as TripModel[])))),
    { initialValue: [] as TripModel[] },
  );
  private readonly localListTrigger = computed(() => {
    const active = this.store.active();
    return `${this.store.initialized()}|${active?.key}|${active?.state}|${this.store.resumable()?.key}|${this.store.uploadError() ?? ''}`;
  });
  protected readonly items = computed(() => mergeTrackLists(this.localTracks(), this.uploaded()));

  // Logbuch link before Start (spec 1.123 §4.1/§4.2): one trip → a removable chip, several → a select
  protected readonly presetTrips = signal<TripModel[]>([]);
  protected readonly selectedLogbuch = signal<TripModel | undefined>(undefined);
  /** A newer preset load makes an older answer stale. */
  private presetSeq = 0;
  /** Logbuch trips whose chip the person removed: a reload does not offer them preselected again. */
  private readonly dismissed = new Set<string>();

  public constructor() {
    void this.store.init();
    // no tick and no live reload behind a locked screen or another page; one refresh when the page shows again
    const tick = setInterval(() => {
      if (this.store.active() && this.isShown()) this.now.set(Date.now());
    }, 1000);
    const onVisibility = (): void => {
      if (this.isShown()) this.refreshNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
    });
    // reload the live points whenever a fix arrives — throttled to LIVE_REFRESH_MS
    effect(() => {
      const key = this.store.active()?.key;
      const count = this.store.points();
      untracked(() => this.scheduleRefresh(key, count));
    });
    // a track started, stopped or finished its upload attempt: the local list changed
    effect(() => {
      this.localListTrigger();
      untracked(() => void this.reloadLocal());
    });
    // the person or the pushed Logbuch trip changed: offer the Logbuch trip(s) to link to
    effect(() => {
      const personKey = this.personKey();
      const logbuchKey = this.logbuch();
      untracked(() => void this.loadPreset(personKey, logbuchKey));
    });
    // a recording ended or calibration was switched: the calibration files may have changed
    effect(() => {
      const recording = this.store.active()?.state === 'recording';
      const calibrating = this.store.calibrating();
      // a file appears when a row recording starts with calibration on, and is complete once recording stops
      if (calibrating || !recording) untracked(() => void this.reloadCalibration());
    });
  }

  /** Ionic lifecycle: back from the detail page (rename, delete, correction). */
  public ionViewWillEnter(): void {
    this.entered = true;
    this.refreshNow();
    void this.reloadLocal();
    if (!this.store.active()) void this.loadPreset(this.personKey(), this.logbuch());
  }

  /** Ionic lifecycle: another page covers this one — the tick and the live map pause. */
  public ionViewDidLeave(): void {
    this.entered = false;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  protected modeLabel(mode: TransportMode): string {
    return this.i18n[`mode_${mode}`]();
  }

  protected km(meters: number): string {
    return formatKm(meters);
  }

  protected setCalibration(on: boolean): void {
    void this.store.setCalibration(on);
  }

  protected calibrationLabel(file: string): string {
    const iso = calibrationStartedAt(file);
    return iso ? this.dateText(Date.parse(iso)) : file;
  }

  /** Asks where the phone was and how many strokes were counted, writes the sidecar JSON and shares both files. */
  protected async shareCalibrationFile(file: string): Promise<void> {
    const alert = await this.alertController.create({
      header: this.i18n.calibration_placement(),
      inputs: [
        { type: 'radio', label: this.i18n.calibration_bag(), value: 'bag', checked: true },
        { type: 'radio', label: this.i18n.calibration_mounted(), value: 'mounted' },
      ],
      buttons: [{ text: this.i18n.common_cancel(), role: 'cancel' }, { text: this.i18n.calibration_share(), role: 'confirm' }],
    });
    await alert.present();
    const { data, role } = await alert.onDidDismiss<{ values: 'bag' | 'mounted' }>();
    if (role !== 'confirm' || !data) return;
    const counted = await okrPrompt(this.alertController, this.i18n.calibration_counted(), '', this.i18n.calibration_share(), this.i18n.common_cancel());
    if (counted === undefined) return;
    const strokes = Number.parseInt(counted, 10);
    try {
      await shareCalibration(file, {
        placement: data.values, startedAt: calibrationStartedAt(file), ...(Number.isFinite(strokes) && strokes > 0 ? { countedStrokes: strokes } : {}),
      });
    } catch (error) {
      if (!isShareCancel(error)) console.error('TrackerPage.shareCalibration', error);
    }
  }

  /** Debug check (spec 1.122 §10): both detectors count the same file; the two numbers must match. */
  protected async checkCalibrationFile(file: string): Promise<void> {
    try {
      const detector = new StrokeDetector();
      let ts = 0;
      for (const sample of parseCalibrationCsv(await readCalibrationCsv(file))) if (detector.push(sample) !== undefined) ts++;
      const native = (await TrackerLocation.replayCalibration({ file })).strokes.length;
      const alert = await this.alertController.create({
        header: this.i18n.calibration_title(), message: fill(this.i18n.calibration_check_result(), { ts, native }), buttons: [this.i18n.calibration_close()],
      });
      await alert.present();
    } catch (error) {
      console.error('TrackerPage.checkCalibration', error);
    }
  }

  private async reloadCalibration(): Promise<void> {
    if (this.showCalibration()) this.calibrationFiles.set(await listCalibrationFiles());
  }

  protected dateText(ms: number): string {
    return new Date(ms).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected async start(): Promise<void> {
    if (this.starting()) return;
    this.starting.set(true);
    try {
      const mode = this.mode();
      const lb = this.selectedLogbuch();
      await this.store.start(mode === AUTO ? undefined : mode, lb ? { logbuchKey: lb.okey, resource: lb.resource } : undefined);
    } finally {
      this.starting.set(false);
    }
  }

  protected async stop(): Promise<void> {
    await this.store.stop();
    await this.reloadLocal();
  }

  protected async resumeRecording(): Promise<void> {
    await this.store.resumeRecording();
  }

  protected async finishResumable(): Promise<void> {
    await this.store.finishResumable();
    await this.reloadLocal();
  }

  protected async retry(event: Event, key: string): Promise<void> {
    event.stopPropagation(); // the button sits inside the item that opens the track
    this.retrying.set(key);
    try {
      await this.store.retryUpload(key);
    } finally {
      this.retrying.set(undefined);
      await this.reloadLocal();
    }
  }

  /** «Alpha, 09:30»: the boat and the start time of a Logbuch trip. */
  protected tripLabel(trip: TripModel): string {
    return logbuchTripLabel(trip);
  }

  protected presetText(trip: TripModel): string {
    return fill(this.i18n.link_preset(), { trip: this.tripLabel(trip) });
  }

  /** '' = no Logbuch trip. Choosing one while the mode is still «Automatisch» takes rowing. */
  protected chooseLogbuch(okey: string): void {
    const before = this.selectedLogbuch();
    if (okey === '' && before) this.dismissed.add(before.okey);
    const trip = this.presetTrips().find((t) => t.okey === okey);
    this.selectedLogbuch.set(trip);
    if (trip && this.mode() === AUTO) this.mode.set('row');
  }

  /**
   * The Logbuch trip(s) to offer: the pushed one when the person is on its crew and it is still open (mode row and
   * its boat), otherwise today's open Logbuch trips with the person on the crew. Failures leave nothing offered.
   */
  private async loadPreset(personKey: string | undefined, logbuchKey: string | undefined): Promise<void> {
    const seq = ++this.presetSeq;
    if (!personKey) {
      this.presetTrips.set([]);
      this.selectedLogbuch.set(undefined);
      return;
    }
    try {
      if (logbuchKey) {
        const pushed = await this.trackService.readLogbuch(logbuchKey);
        if (seq !== this.presetSeq) return;
        const preset = pickLogbuchPreset(pushed ? [pushed] : [], personKey);
        if (preset.kind === 'one' && !this.dismissed.has(preset.trip.okey)) {
          this.presetTrips.set([preset.trip]);
          this.selectedLogbuch.set(preset.trip);
          if (this.mode() === AUTO) this.mode.set('row'); // a mode picked by hand stays on a reload
          return;
        }
      }
      const trips = await this.trackService.findMyOpenLogbuchTrips(personKey, this.appStore.tenantId(), localStoreDate(Date.now()));
      if (seq !== this.presetSeq) return;
      const preset = pickLogbuchPreset(trips, personKey);
      if (preset.kind === 'one') {
        this.presetTrips.set([preset.trip]);
        const offer = !this.dismissed.has(preset.trip.okey);
        this.selectedLogbuch.set(offer ? preset.trip : undefined);
        if (offer && this.mode() === AUTO) this.mode.set('row');
      } else {
        const list = preset.kind === 'many' ? preset.trips : [];
        this.presetTrips.set(list);
        // a choice made in the select survives a reload while that trip is still offered
        const kept = list.find((t) => t.okey === this.selectedLogbuch()?.okey);
        this.selectedLogbuch.set(kept);
      }
    } catch (error) {
      console.error('TrackerPage.loadPreset', error);
    }
  }

  protected open(key: string): void {
    void this.router.navigate(['/tracker', key]);
  }

  /** Only on the device (nothing is local on the web) and once init() has opened TrackDb. */
  private async reloadLocal(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.store.initialized()) return;
    try {
      this.localTracks.set(await this.db.list());
    } catch (error) {
      console.error('TrackerPage.reloadLocal', error);
    }
  }

  /** `count` (points recorded so far) is only the trigger; the reload reads TrackDb. */
  private scheduleRefresh(key: string | undefined, count: number): void {
    if (!key || count < 0) {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
      this.livePoints.set([]);
      return;
    }
    if (!this.isShown()) return; // refreshNow() catches up when the page shows again
    if (this.refreshTimer) return; // one reload is already planned; it reads the newest points
    const wait = Math.max(0, this.lastRefresh + LIVE_REFRESH_MS - Date.now());
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.lastRefresh = Date.now();
      void this.loadLive(key);
    }, wait);
  }

  private isShown(): boolean {
    return this.entered && document.visibilityState === 'visible';
  }

  /** The page shows again: duration and live map catch up at once. */
  private refreshNow(): void {
    this.now.set(Date.now());
    const key = this.store.active()?.key;
    if (!key) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.lastRefresh = Date.now();
    void this.loadLive(key);
  }

  private async loadLive(key: string): Promise<void> {
    if (!this.isShown()) return;
    try {
      const points = await this.db.points(key);
      if (this.store.active()?.key === key) this.livePoints.set(points);
    } catch (error) {
      console.error('TrackerPage.loadLive', error);
    }
  }
}

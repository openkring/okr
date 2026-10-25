import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonListHeader, IonNote, IonSpinner, IonTitle,
  IonToolbar, ToastController,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { TRANSPORT_MODES, TransportMode, TripModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { confirm, downloadFile, okrPrompt } from '@okr/shared-util-angular';
import { TrackDb, TrackService } from '@okr/mobility-tracker-data-access';
import { TrackMap, TrackMapSection, TrackModeChange, TrackSections } from '@okr/mobility-tracker-ui';
import {
  alignSections, buildGpx, correctedTrack, fromLocalSections, gpxFileName, isShareCancel, LocalSection, LocalTrack, localFromTrip, mergeWithNext,
  middlePointIndex, sectionRows, setSectionMode, splitSection, toLocalSections,
} from '@okr/mobility-tracker-util';

import { TrackerStore } from './tracker.store';

/**
 * One recorded track (spec 1.121, plan 2 task 9): map, sections with corrections (mode, split, merge), rename,
 * delete and GPX export. A track still on this device is corrected in TrackDb first and then uploaded again
 * (same key: the trip is overwritten); a track that only exists uploaded is rebuilt from the trip and uploaded
 * corrected. Corrections need a finished track.
 */
@Component({
  selector: 'okr-track-detail-page',
  imports: [
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, IonListHeader, IonLabel, IonNote, IonSpinner,
    SvgIconPipe, TrackMap, TrackSections,
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
        <okr-track-map [sections]="mapSections()" [live]="false" />
        @if (!t.uploaded) {
          <ion-note class="note" color="warning">{{ i18n.list_not_uploaded() }}</ion-note>
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

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly track = signal<LocalTrack | undefined>(undefined);
  protected readonly sections = signal<LocalSection[]>([]);
  /** true when the track is (also) in TrackDb on this device. */
  private readonly isLocal = signal(false);
  /** The uploaded trip, when one was found. */
  private readonly trip = signal<TripModel | undefined>(undefined);

  protected readonly editable = computed(() => this.track()?.state === 'done' && !this.busy());
  protected readonly mapSections = computed<TrackMapSection[]>(() => this.sections().map((s) => ({ mode: s.mode, points: s.points })));
  protected readonly rows = computed(() => sectionRows(this.sections()));
  protected readonly pointCounts = computed(() => this.sections().map((s) => s.points.length));

  public constructor() {
    effect(() => {
      const key = this.key();
      untracked(() => void this.load(key));
    });
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
    const url = URL.createObjectURL(new Blob([buildGpx(t.name, this.sections())], { type: 'application/gpx+xml' }));
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
      const local = (await this.db.list()).find((t) => t.key === key);
      const trip = await this.findTrip(key);
      this.trip.set(trip);
      if (local) {
        const points = alignSections(await this.db.points(key), local.sections.length);
        this.isLocal.set(true);
        this.track.set(local);
        this.sections.set(toLocalSections(local, points));
      } else if (trip?.track) {
        const points = await Promise.all(trip.track.sections.map((_, n) => this.trackService.readPoints(key, n)));
        const { track, sections } = localFromTrip(trip, points);
        this.isLocal.set(false);
        this.track.set(track);
        this.sections.set(sections);
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
    void this.trackService.upload(corrected.track, corrected.points, owner, oldCount)
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
      this.sections.set(toLocalSections(local, alignSections(await this.db.points(key), local.sections.length)));
    } catch (error) {
      console.error('TrackDetailPage.reloadLocal', error);
    }
  }

  private owner(): { personKey: string; uid: string } | undefined {
    const personKey = this.appStore.currentUser()?.personKey;
    const uid = this.appStore.fbUser()?.uid;
    return personKey && uid ? { personKey, uid } : undefined;
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

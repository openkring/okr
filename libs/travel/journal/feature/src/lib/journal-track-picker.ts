import { inject } from '@angular/core';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import type { SectionTrackPicker } from '@okr/cms-section-util';
import { TrackService } from '@okr/mobility-tracker-data-access';
import { AppStore } from '@okr/shared-feature';
import { TripModel } from '@okr/shared-models';
import { fill } from '@okr/shared-util-core';
import { JournalTrackPickModal, PickableTrack } from '@okr/travel-journal-ui';
import { TrackCopyInput, trackDate, TrackPickItem, trackPickItems, trackSummary } from '@okr/travel-journal-util';
import { formatKm } from '@okr/mobility-tracker-util';

import { showJournalError } from './journal-errors';
import { JournalStore } from './journal.store';

/**
 * The travel journal's `SECTION_TRACK_PICKER` (spec 1.154 phase 5, decisions 7 and 8). Online (the browser is online
 * and somebody is signed in) it lists the author's tracker trips, the footprint's day on top, plus the tracks the journal
 * holds; offline only the journal's tracks. Choosing a trip the journal does not hold yet reads its points, imports
 * its visible photos and writes the derived `track` record — `pick` resolves only once the track is in the journal
 * state, so the section that refers to it can be saved at once. The track entity is never archived (ruling R1).
 */
export class JournalTrackPicker implements SectionTrackPicker {
  private readonly store = inject(JournalStore);
  private readonly appStore = inject(AppStore);
  private readonly trackService = inject(TrackService);
  private readonly modalController = inject(ModalController);
  private readonly loadingController = inject(LoadingController);
  private readonly toastController = inject(ToastController);

  public constructor(private readonly journalKey: string, private readonly footprintKey: string) {}

  public label(trackKey: string): string | undefined {
    const track = this.store.track(trackKey);
    return track ? trackSummary(track, this.store.i18n.track_untitled()) : undefined;
  }

  public async pick(current?: string): Promise<{ trackKey: string; label: string } | undefined> {
    const personKey = this.appStore.currentUser()?.personKey;
    const online = typeof navigator !== 'undefined' && navigator.onLine && !!personKey;
    let items: TrackPickItem[];
    try {
      items = await this.items(online ? personKey : undefined);
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
      return undefined;
    }
    const i18n = this.store.i18n;
    const tracks: PickableTrack[] = items.map((item) => ({
      key: item.key, name: item.name.trim() || i18n.track_untitled(), facts: this.facts(item), inJournal: item.inJournal, current: item.key === current,
    }));
    const modal = await this.modalController.create({
      component: JournalTrackPickModal,
      componentProps: {
        tracks,
        i18n: { title: i18n.track_pick_title(), empty: i18n.track_pick_empty(), inJournal: i18n.track_in_journal(), offline: online ? '' : i18n.track_pick_offline() },
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<string>();
    const chosen = role === 'confirm' ? items.find((i) => i.key === data) : undefined;
    if (!chosen) return undefined;
    if (!chosen.inJournal && !(await this.attach(chosen.tripKey))) return undefined;
    const label = this.label(chosen.key);
    return label ? { trackKey: chosen.key, label } : undefined;
  }

  /** Online: the day's trips, all my trips and the journal's tracks; offline: the journal's tracks only. */
  private async items(personKey: string | undefined): Promise<TrackPickItem[]> {
    const journalTracks = this.store.tracks(this.journalKey);
    if (!personKey) return trackPickItems([], [], journalTracks);
    const date = this.store.footprint(this.footprintKey)?.date ?? '';
    const tenantId = this.appStore.tenantId();
    const [mine, ofDay] = await Promise.all([
      firstValueFrom(this.trackService.listMine(personKey)),
      date && tenantId ? firstValueFrom(this.trackService.listOfDay(personKey, tenantId, date)) : Promise.resolve<TripModel[]>([]),
    ]);
    this.trips = new Map([...mine, ...ofDay].map((t) => [t.okey, t]));
    return trackPickItems(mine, ofDay, journalTracks);
  }

  /** The trips the list was built from, by key (the chosen one is attached from here). */
  private trips = new Map<string, TripModel>();

  /** «14.01.2027 · Zu Fuss · Zug · 12,3 km» */
  private facts(item: TrackPickItem): string {
    const modes = item.modes.map((m) => this.store.i18n[`transport_${m}`]());
    return [trackDate(item.startedAt), ...modes, item.distanceM > 0 ? formatKm(item.distanceM) : ''].filter((p) => p !== '').join(' · ');
  }

  /** Reads the trip's points, imports its photos and writes the track (decision 8). False when it failed (shown). */
  private async attach(tripKey: string): Promise<boolean> {
    const trip = this.trips.get(tripKey);
    if (!trip?.track) return false;
    const loading = await this.loadingController.create({ message: this.store.i18n.track_attaching() });
    await loading.present();
    let result: { skipped: number; slow: boolean };
    try {
      const reads = await Promise.all(trip.track.sections.map((_, n) => this.trackService.readSection(tripKey, n)));
      const sections: TrackCopyInput[] = trip.track.sections.map((s, n) => ({ mode: s.mode, points: reads[n].points, distanceM: s.distanceM }));
      result = await this.store.attachTrack(this.journalKey, trip, sections);
    } catch (error) {
      await loading.dismiss();
      await showJournalError(this.toastController, this.store.i18n, error);
      return false;
    }
    await loading.dismiss();
    // a slow browser write keeps its records, already in the state: the track can be used
    const { skipped, slow } = result;
    const notes = [skipped > 0 ? fill(this.store.i18n.track_photos_skipped(), { count: skipped }) : '', slow ? this.store.i18n.write_slow() : '']
      .filter((n) => n !== '');
    if (notes.length > 0) {
      const toast = await this.toastController.create({ message: notes.join(' · '), duration: 4000, position: 'bottom' });
      await toast.present();
    }
    return true;
  }
}

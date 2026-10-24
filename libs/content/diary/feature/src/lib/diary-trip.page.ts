import { Component, ComponentRef, DestroyRef, PLATFORM_ID, computed, effect, inject, input, linkedSignal, resource, signal, untracked, viewChild, ViewContainerRef } from '@angular/core';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle,
  IonContent, IonHeader, IonIcon, IonNote, IonTitle, IonToolbar,
} from '@ionic/angular';
import { firstValueFrom, timeout } from 'rxjs';

import { diaryListUrl, encodeDiaryFilter, formatDiaryDate, mainLocation, tripMapPoints, TripMapPoint } from '@okr/content-diary-util';
import { LocationService } from '@okr/location-data-access';
import { TripModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ChangeConfirmation, LeafletMap, MapMarker, Spinner } from '@okr/shared-ui';
import type { OkrEditor } from '@okr/shared-ui-editor';
import { isBrowser, resourceParams } from '@okr/shared-util-angular';

import { DiaryStore } from './diary.store';

/** The editor's empty document; treated as «no notes» so opening the page never marks it dirty. */
const EMPTY_EDITOR = '<p></p>';
function normaliseNotes(html: string | undefined): string {
  const value = (html ?? '').trim();
  return value === EMPTY_EDITOR ? '' : value;
}

interface Coordinates { lat: number; lng: number }

/**
 * A travel trip of the diary (spec 1.114 §6): header with span and day count, an inline route map of
 * the trip's located entries (date order) plus its own locations, and the trip notes.
 * Route: `diary/trip/:tripKey`. Leaflet loads inside `okr-leaflet-map`, ngx-editor through a dynamic
 * import (Pattern A, `lazy-loading` skill) — neither reaches the eager bundle.
 */
@Component({
  selector: 'okr-diary-trip-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, LeafletMap, ChangeConfirmation,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonButton, IonIcon, IonTitle, IonContent,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonNote,
  ],
  providers: [DiaryStore],
  styles: [`
    .trip-map { height: 50vh; min-height: 280px; }
    .trip-map okr-leaflet-map { height: 100%; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/diary/all/c-diary" /></ion-buttons>
        <ion-title>{{ trip()?.name ?? '' }}</ion-title>
        @if (trip()) {
          <ion-buttons slot="end">
            <ion-button (click)="edit()" [attr.aria-label]="store.i18n.edit()">
              <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      @if (notesDirty()) {
        <okr-change-confirmation [i18n]="confirmI18n()" (saveClicked)="saveNotes()" (cancelClicked)="resetNotes()" />
      }
    </ion-header>
    <ion-content>
      @if (store.tripsResource.isLoading() && !trip()) {
        <okr-spinner />
      } @else if (trip(); as trip) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ trip.name }}</ion-card-title>
            <ion-card-subtitle>{{ span() }} · {{ dayCount() }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-button fill="outline" size="small" (click)="showEntries()">{{ store.i18n.trip_show_entries() }}</ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ store.i18n.trip_map() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            @if (points().length > 0) {
              <div class="trip-map">
                <okr-leaflet-map [markers]="points()" [route]="true" tiles="osm" (markerClick)="openPoint($event)" />
              </div>
            } @else if (pointsLoading()) {
              <okr-spinner />
            } @else {
              <ion-note>{{ store.i18n.trip_no_points() }}</ion-note>
            }
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ store.i18n.trip_notes() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <div #editorHost></div>
          </ion-card-content>
        </ion-card>
      } @else {
        <ion-note class="ion-padding">{{ store.i18n.trip_not_found() }}</ion-note>
      }
    </ion-content>
  `,
})
export class DiaryTripPage {
  protected readonly store = inject(DiaryStore);
  private readonly locationService = inject(LocationService);
  private readonly platformId = inject(PLATFORM_ID);

  // route input — withComponentInputBinding writes undefined when the param is missing
  public readonly tripKey = input<string | undefined>('');

  protected readonly trip = computed((): TripModel | undefined => {
    const key = this.tripKey() ?? '';
    return key ? this.store.travelTrips().find(t => t.okey === key) : undefined;
  });

  /**
   * The trip's entries: the store's own trip filter (`initFromRoute('trip.<okey>')`), so the store
   * queries `listByTrip` instead of the year range, and an entry edited from the view modal reloads it.
   */
  private readonly entries = computed(() => this.store.diaries());

  /** Coordinates of every location the page needs (entries + trip-own), read once per key set. */
  private readonly coordsResource = resource({
    params: resourceParams(() => {
      const keys = new Set<string>();
      for (const entry of this.entries()) for (const location of entry.locations ?? []) if (location.key) keys.add(location.key);
      for (const location of this.trip()?.locations ?? []) if (location?.key) keys.add(location.key);
      return { keys: [...keys].sort() };
    }),
    loader: ({ params }) => this.readCoordinates(params.keys),
  });

  protected readonly pointsLoading = computed(() => this.store.isLoading() || this.coordsResource.isLoading());

  /** the last loaded coordinates — kept while the resource reloads, so the map does not flicker away */
  private readonly coords = linkedSignal<Map<string, Coordinates> | undefined, Map<string, Coordinates>>({
    source: () => this.coordsResource.value(),
    computation: (value, previous) => value ?? previous?.value ?? new Map<string, Coordinates>(),
  });

  protected readonly points = computed((): TripMapPoint[] => {
    const coords = this.coords();
    const entries = this.entries().map(entry => {
      const mainKey = mainLocation(entry)?.key;
      const c = mainKey ? coords.get(mainKey) : undefined;
      // pin detail = date + entry title
      const title = [formatDiaryDate(entry.date), entry.title].filter(part => !!part).join(' · ');
      return { date: entry.date, okey: entry.okey, title, lat: c?.lat, lng: c?.lng };
    });
    const own = (this.trip()?.locations ?? []).flatMap(location => {
      const c = location?.key ? coords.get(location.key) : undefined;
      return c ? [{ lat: c.lat, lng: c.lng, title: location.name1 || location.label || '' }] : [];
    });
    // every further keyed location of an entry is an extra pin (not part of the route)
    const extra = this.entries().flatMap(entry => (entry.locations ?? []).slice(1).flatMap(location => {
      const c = location.key ? coords.get(location.key) : undefined;
      return c ? [{ lat: c.lat, lng: c.lng, title: location.name1 || location.label || '', date: entry.date, diaryKey: entry.okey }] : [];
    }));
    return tripMapPoints(entries, own, extra);
  });

  protected readonly span = computed(() => {
    const trip = this.trip();
    if (!trip) return '';
    return [trip.startDate, trip.endDate].filter(d => !!d).map(d => formatDiaryDate(d)).join(' – ');
  });

  protected readonly dayCount = computed(() => {
    // only day entries count; a legacy doc without `scope` is a day (Firestore reads skip model defaults)
    const count = this.entries().filter(entry => (entry.scope ?? 'day') === 'day').length;
    // single braces: translateAll strips Transloco's {{params}} (memory: translateall-strips-double-brace-params)
    return count === 1 ? this.store.i18n.trip_day() : this.store.i18n.trip_days().replace('{count}', String(count));
  });

  protected readonly confirmI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save() }));

  // ---------------------------------------------------------------- notes
  /** the notes as last loaded or saved — seeded once per trip, not on every stream emission */
  private readonly savedNotes = signal('');
  protected readonly notes = signal('');
  private seededTripKey = '';
  protected readonly notesDirty = computed(() => normaliseNotes(this.notes()) !== normaliseNotes(this.savedNotes()));

  private readonly editorHost = viewChild('editorHost', { read: ViewContainerRef });
  private readonly editorRef = signal<ComponentRef<OkrEditor> | undefined>(undefined);
  private creatingEditor = false;
  private destroyed = false;

  constructor() {
    // the store filters by this trip (its list is not shown here, only its entries are used)
    effect(() => {
      const key = this.tripKey() ?? '';
      if (key) untracked(() => this.store.initFromRoute(`trip.${key}`, 'c-diary'));
    });

    // seed the notes once per trip (a re-emitting trips stream must not wipe what is being typed)
    effect(() => {
      const trip = this.trip();
      if (!trip || trip.okey === this.seededTripKey) return;
      this.seededTripKey = trip.okey;
      untracked(() => {
        this.savedNotes.set(trip.notes ?? '');
        this.notes.set(trip.notes ?? '');
      });
    });

    // Pattern A (lazy-loading skill): ngx-editor must not be statically reachable.
    effect(() => {
      const host = this.editorHost();
      if (!host) {
        if (untracked(() => this.editorRef())) this.editorRef.set(undefined);
        return;
      }
      if (untracked(() => this.editorRef()) || this.creatingEditor || !isBrowser(this.platformId)) return;
      this.creatingEditor = true;
      void (async () => {
        try {
          const { OkrEditor } = await import('@okr/shared-ui-editor');
          // the host may have been torn down (trip gone, page left) while the chunk was loading
          if (this.destroyed || this.editorHost() !== host || untracked(() => this.editorRef())) return;
          const ref = host.createComponent(OkrEditor);
          ref.instance.content.subscribe((value: string) => this.notes.set(value));
          this.editorRef.set(ref);
        } finally {
          this.creatingEditor = false;
        }
      })();
    });
    effect(() => {
      const ref = this.editorRef();
      const content = this.notes() || EMPTY_EDITOR;
      const copyConf = this.store.i18n.copy_conf();
      if (!ref) return;
      ref.setInput('content', content);
      ref.setInput('readOnly', false);
      ref.setInput('buttonCopyI18n', { copy_conf: copyConf });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.editorRef()?.destroy();
    });
  }

  /******************************* actions *************************************** */
  protected async edit(): Promise<void> {
    const trip = this.trip();
    if (!trip) return;
    // the trip form does not carry the notes: keep the saved ones, the draft stays on screen
    await this.store.editTravelTrip({ ...trip, notes: this.savedNotes() });
  }

  protected async showEntries(): Promise<void> {
    const trip = this.trip();
    if (!trip) return;
    // not `store.setFilter`: this store already holds the trip filter and would apply it in place
    await this.store.navController.navigateForward(diaryListUrl(encodeDiaryFilter({ kind: 'trip', key: trip.okey, title: trip.name, from: '', to: '' }), 'c-diary'));
  }

  protected async saveNotes(): Promise<void> {
    const trip = this.trip();
    if (!trip) return;
    const notes = normaliseNotes(this.notes());
    const key = await this.store.diaryService.updateTravelTrip({ ...trip, notes }, this.store.currentUser());
    if (key) this.savedNotes.set(notes);
  }

  protected resetNotes(): void {
    this.notes.set(this.savedNotes());
  }

  protected async openPoint(marker: MapMarker): Promise<void> {
    const diaryKey = (marker as Partial<TripMapPoint>).diaryKey;
    if (!diaryKey) return;
    const diary = this.entries().find(entry => entry.okey === diaryKey);
    if (diary) await this.store.view(diary);
  }

  /** Bounded like `DiaryStore.coordinatesOf`: a location stream that never emits must not hang the map. */
  private async readCoordinates(keys: string[]): Promise<Map<string, Coordinates>> {
    const result = new Map<string, Coordinates>();
    await Promise.all(keys.map(async key => {
      const record = await firstValueFrom(this.locationService.read(key).pipe(timeout(5000))).catch(() => undefined);
      const lat = record?.latitude;
      const lng = record?.longitude;
      if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
        result.set(key, { lat, lng });
      }
    }));
    return result;
  }
}

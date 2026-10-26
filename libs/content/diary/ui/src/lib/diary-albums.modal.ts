import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonIcon, IonItem, IonLabel, IonList,
  IonNote, IonSearchbar, IonSegment, IonSegmentButton, IonToolbar, ModalController,
} from '@ionic/angular';

import { DiaryAlbumKind, DiaryAlbumModel, TRANSPORT_MODES, TransportMode, TripModel } from '@okr/shared-models';
import { TrackerI18n } from '@okr/mobility-tracker-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Header } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions, dismissOverlay } from '@okr/shared-util-angular';

import {
  DiaryDateRange, DiaryFilter, DiaryI18n, DiaryTrackFilterKey, albumKey, albumRefOf, canApplyDiaryDateRange, formatDiaryDate,
  mergeDiaryDateRange, trackFilterTitle,
} from '@okr/content-diary-util';
import { DiaryDateRangeForm } from './diary-date-range.form';

export type DiaryAlbumsSegment = DiaryAlbumKind | 'trip' | 'track' | 'tag' | 'date';

const SEGMENTS: DiaryAlbumsSegment[] = ['event', 'person', 'location', 'trip', 'track', 'tag', 'date'];
const SEGMENT_KEY = 'okr.diary.albumSegment';
const ICONS: Record<DiaryAlbumsSegment, string> = {
  event: 'star', person: 'person', location: 'location', trip: 'airplane', track: 'map', tag: 'tag', date: 'calendar',
};

function readSegment(): DiaryAlbumsSegment {
  try {
    const value = localStorage.getItem(SEGMENT_KEY) as DiaryAlbumsSegment | null;
    return value && SEGMENTS.includes(value) ? value : 'event';
  } catch { return 'event'; }
}

function writeSegment(value: DiaryAlbumsSegment): void {
  try { localStorage.setItem(SEGMENT_KEY, value); } catch { /* private mode: not remembered */ }
}

/** One visible row: an album, a tag or a trip, with the date it sorts by and the note it shows. */
interface AlbumRow {
  id: string;
  title: string;
  /** StoreDate the row sorts by (newest entry, or trip start); '' sorts last */
  sortDate: string;
  note: string;
  album?: DiaryAlbumModel;
  trip?: TripModel;
  tag?: string;
  /** «Strecken»: a transport mode, or 'all' */
  track?: DiaryTrackFilterKey;
}

/** «Alle» first, then the transport modes in the tracker's order. */
const TRACK_KEYS: DiaryTrackFilterKey[] = ['all', ...TRANSPORT_MODES];

/**
 * «Alben» (spec 1.114 §4): pick an album, a trip, a transport mode («Strecken», spec 1.121 §7), a tag or a
 * date range to filter the diary list.
 * A picker, not an edit dialog — all data comes in as inputs and every write goes through the
 * callbacks, so the modal never injects the store (store-modal-dynamic-import). A tap dismisses
 * with role 'filter' and a `DiaryFilter`.
 */
@Component({
  selector: 'okr-diary-albums-modal',
  standalone: true,
  imports: [
    Header, EmptyList, DiaryDateRangeForm, SvgIconPipe,
    IonToolbar, IonSegment, IonSegmentButton, IonLabel, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonNote,
  ],
  styles: [`ion-segment { overflow-x: auto; }`],
  template: `
    <okr-header [i18n]="{ title: i18n().albums_title() }" [isModal]="true" />
    <ion-toolbar color="light">
      <ion-segment [value]="segment()" [scrollable]="true" (ionChange)="onSegmentChange($event)">
        @for (s of segments; track s) {
          <ion-segment-button [value]="s"><ion-label>{{ segmentLabel(s) }}</ion-label></ion-segment-button>
        }
      </ion-segment>
    </ion-toolbar>
    @if (segment() !== 'date') {
      <ion-toolbar>
        <ion-searchbar [value]="searchTerm()" [placeholder]="i18n().albums_search()" [debounce]="200"
          (ionInput)="searchTerm.set($any($event).detail.value ?? '')" />
        @if (canAdd()) {
          <ion-buttons slot="end">
            <ion-button (click)="add()"><ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" /></ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    }
    <ion-content>
      @if (segment() === 'date') {
        @if (appliesTo(); as appliesTo) {
          <ion-note class="ion-padding-start ion-padding-top" color="primary">{{ appliesTo }}</ion-note>
        }
        <okr-diary-date-range-form [i18n]="i18n()" [(formData)]="range" (valid)="rangeValid.set($event)" />
        <ion-button class="ion-margin" expand="block" [disabled]="!canApplyRange()" (click)="applyRange()">
          {{ i18n().albums_apply() }}
        </ion-button>
      } @else if (rows().length === 0) {
        <okr-empty-list [message]="i18n().albums_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (row of rows(); track row.id) {
            <ion-item button [detail]="false" (click)="select(row)">
              <ion-icon slot="start" src="{{ icon() | svgIcon }}" />
              <ion-label>{{ row.title }}</ion-label>
              <ion-note slot="end">{{ row.note }}</ion-note>
              @if (!row.tag && !row.track) {
                <ion-button slot="end" fill="clear" (click)="$event.stopPropagation(); showActions(row)">
                  <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
                </ion-button>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class DiaryAlbumsModal {
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs — data in, actions as callbacks
  public readonly i18n = input.required<DiaryI18n>();
  public readonly albums = input<DiaryAlbumModel[]>([]);
  public readonly trips = input<TripModel[]>([]);
  public readonly tags = input<string[]>([]);
  public readonly imgixBaseUrl = input('');
  public readonly newestDate = input.required<(key: string) => Promise<string>>();
  /** opens the album edit modal; returns the refreshed album list */
  public readonly editAlbum = input.required<(kind: DiaryAlbumKind, album?: DiaryAlbumModel) => Promise<DiaryAlbumModel[]>>();
  /** opens the trip edit modal; returns the refreshed trip list */
  public readonly editTrip = input.required<(trip?: TripModel) => Promise<TripModel[]>>();
  public readonly archiveAlbum = input.required<(album: DiaryAlbumModel) => Promise<DiaryAlbumModel[]>>();
  public readonly openTrip = input.required<(trip: TripModel) => void>();
  /** the list's current filter: a range from the Datum segment narrows an album/tag/trip filter */
  public readonly activeFilter = input<DiaryFilter | undefined>(undefined);
  /** the tracker's labels, for the transport modes of the «Strecken» segment */
  public readonly trackI18n = input<TrackerI18n | undefined>(undefined);

  protected readonly segments = SEGMENTS;
  protected readonly segment = signal<DiaryAlbumsSegment>(readSegment());
  protected readonly searchTerm = signal('');
  /** starts at the active filter's range, so an applied narrowing can be seen and removed again */
  protected readonly range = linkedSignal<DiaryDateRange>(() => ({ from: this.activeFilter()?.from ?? '', to: this.activeFilter()?.to ?? '' }));
  protected readonly rangeValid = signal(false);

  // the lists are refreshed by the edit callbacks, so they are local copies of the inputs
  private readonly localAlbums = linkedSignal(() => this.albums());
  private readonly localTrips = linkedSignal(() => this.trips());

  /** album key -> newest linked diary date ('' = none); a key is fetched once per modal */
  private readonly newestDates = signal<Record<string, string>>({});
  private readonly requested = new Set<string>();

  protected readonly icon = computed(() => ICONS[this.segment()]);
  protected readonly canAdd = computed(() => !['track', 'tag', 'date'].includes(this.segment()));
  /** the album, tag or trip a range would narrow; undefined for none or a date filter */
  private readonly narrowable = computed(() => {
    const filter = this.activeFilter();
    return filter && filter.kind !== 'date' ? filter : undefined;
  });
  /** «gilt für: Anna» — single braces, translateAll strips {{params}} */
  protected readonly appliesTo = computed(() => {
    const filter = this.narrowable();
    return filter ? this.i18n().albums_applies_to().replace('{title}', filter.title || filter.key) : '';
  });
  // a plain date filter needs both bounds; over an album one open end or an empty range is fine
  protected readonly canApplyRange = computed(() =>
    this.rangeValid() && canApplyDiaryDateRange(this.range().from, this.range().to, !!this.narrowable()));

  /** the album keys whose newest date the visible segment shows */
  private readonly datedKeys = computed((): string[] => {
    const segment = this.segment();
    if (segment === 'tag') return this.tags().map(tag => albumKey('tag', tag));
    if (segment === 'event' || segment === 'person' || segment === 'location') {
      return this.localAlbums().filter(a => a.kind === segment).map(a => this.keyOf(a));
    }
    return [];
  });

  protected readonly rows = computed((): AlbumRow[] => {
    const segment = this.segment();
    const dates = this.newestDates();
    let rows: AlbumRow[];
    if (segment === 'trip') {
      rows = this.localTrips().map(trip => ({
        id: trip.okey, title: trip.name, sortDate: trip.startDate ?? '', trip,
        note: [trip.startDate, trip.endDate].filter(d => !!d).map(d => formatDiaryDate(d)).join(' – '),
      }));
    } else if (segment === 'tag') {
      rows = this.tags().map(tag => {
        const date = dates[albumKey('tag', tag)] ?? '';
        return { id: tag, title: tag, sortDate: date, note: date ? formatDiaryDate(date) : '', tag };
      });
    } else if (segment === 'track') {
      // a fixed choice, kept in its order (no dates to sort by)
      const term = this.searchTerm().trim().toLowerCase();
      return TRACK_KEYS
        .map(track => ({ id: track, title: track === 'all' ? this.i18n().albums_track_all() : this.modeLabel(track), sortDate: '', note: '', track }))
        .filter(row => !term || row.title.toLowerCase().includes(term));
    } else if (segment === 'date') {
      rows = [];
    } else {
      rows = this.localAlbums().filter(a => a.kind === segment).map(album => {
        const date = dates[this.keyOf(album)] ?? '';
        return { id: album.okey, title: album.title, sortDate: date, note: date ? formatDiaryDate(date) : '', album };
      });
    }
    const term = this.searchTerm().trim().toLowerCase();
    return rows
      .filter(row => !term || row.title.toLowerCase().includes(term))
      // newest first; rows without a date last, then by title
      .sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.title.localeCompare(b.title));
  });

  constructor() {
    effect(() => {
      const keys = this.datedKeys();
      untracked(() => this.fetchDates(keys));
    });
  }

  /** «Rudern» from the tracker's labels; the mode itself while they are missing */
  private modeLabel(mode: TransportMode): string {
    return this.trackI18n()?.[`mode_${mode}` as keyof TrackerI18n]?.() || mode;
  }

  private keyOf(album: DiaryAlbumModel): string {
    return albumKey(album.kind, albumRefOf(album));
  }

  /** One query per key, each on its own: a failing album shows no date, the others still do. */
  private fetchDates(keys: string[]): void {
    const fetchNewest = this.newestDate();
    for (const key of keys) {
      if (this.requested.has(key)) continue;
      this.requested.add(key);
      fetchNewest(key)
        .catch(() => '')
        .then(date => this.newestDates.update(dates => ({ ...dates, [key]: date ?? '' })));
    }
  }

  protected segmentLabel(segment: DiaryAlbumsSegment): string {
    const i18n = this.i18n();
    switch (segment) {
      case 'event': return i18n.albums_seg_event();
      case 'person': return i18n.albums_seg_person();
      case 'location': return i18n.albums_seg_location();
      case 'trip': return i18n.albums_seg_trip();
      case 'track': return i18n.albums_seg_track();
      case 'tag': return i18n.albums_seg_tag();
      case 'date': return i18n.albums_seg_date();
    }
  }

  protected onSegmentChange(event: CustomEvent): void {
    const value = event.detail.value as DiaryAlbumsSegment;
    if (!SEGMENTS.includes(value)) return;
    this.segment.set(value);
    this.searchTerm.set('');
    writeSegment(value);
  }

  protected async add(): Promise<void> {
    const segment = this.segment();
    try {
      if (segment === 'trip') this.localTrips.set(await this.editTrip()());
      else if (segment === 'event' || segment === 'person' || segment === 'location') {
        this.localAlbums.set(await this.editAlbum()(segment));
      }
    } catch (ex) {
      this.failed('add', ex);
    }
  }

  private failed(action: string, ex: unknown): void {
    console.error(`DiaryAlbumsModal.${action}`, ex);
    this.alertService.error(this.i18n().albums_action_failed());
  }

  protected async select(row: AlbumRow): Promise<void> {
    let filter: DiaryFilter | undefined;
    if (row.album) {
      filter = { kind: row.album.kind, key: this.keyOf(row.album), title: row.title, from: '', to: '' };
    } else if (row.tag) {
      filter = { kind: 'tag', key: albumKey('tag', row.tag), title: row.tag, from: '', to: '' };
    } else if (row.trip) {
      // the trip query decides its days (tripKey or span); from/to are only a user narrowing
      filter = { kind: 'trip', key: row.trip.okey, title: row.title, from: '', to: '' };
    } else if (row.track) {
      const title = trackFilterTitle(row.track, { tracks: this.i18n().albums_seg_track(), mode: mode => this.modeLabel(mode) });
      filter = { kind: 'track', key: row.track, title, from: '', to: '' };
    }
    if (filter) await dismissOverlay(this.modalController, filter, 'filter');
  }

  protected async applyRange(): Promise<void> {
    if (!this.canApplyRange()) return;
    const { from, to } = this.range();
    await dismissOverlay(this.modalController, mergeDiaryDateRange(this.activeFilter(), from, to), 'filter');
  }

  protected async showActions(row: AlbumRow): Promise<void> {
    const base = this.imgixBaseUrl();
    const options: ActionSheetOptions = createActionSheetOptions(row.title);
    options.buttons.push(createActionSheetButton('edit', this.i18n().edit(), base, 'edit'));
    if (row.album) options.buttons.push(createActionSheetButton('archive', this.i18n().albums_archive(), base, 'archive'));
    if (row.trip) options.buttons.push(createActionSheetButton('openTrip', this.i18n().albums_open_trip(), base, 'map'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n().cancel(), base, 'cancel'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    try {
      await this.runAction(data?.action, row);
    } catch (ex) {
      this.failed(String(data?.action), ex);
    }
  }

  private async runAction(action: string | undefined, row: AlbumRow): Promise<void> {
    switch (action) {
      case 'edit':
        if (row.album) this.localAlbums.set(await this.editAlbum()(row.album.kind, row.album));
        else if (row.trip) this.localTrips.set(await this.editTrip()(row.trip));
        break;
      case 'archive':
        if (row.album) this.localAlbums.set(await this.archiveAlbum()(row.album));
        break;
      case 'openTrip':
        if (row.trip) {
          await dismissOverlay(this.modalController, undefined, 'cancel');
          this.openTrip()(row.trip);
        }
        break;
    }
  }
}

import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import {
  IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonSearchbar,
  IonSkeletonText, ModalController,
} from '@ionic/angular';

import { LocationModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, LeafletMap, MapMarker } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { PlaceSearchService } from '@okr/location-data-access';
import { PlaceHit, SavedMatch, matchSavedLocations, searchTextOf } from '@okr/location-util';
import { DiaryI18n } from '@okr/content-diary-util';

/** What the picker hands back on 'confirm'. A close leaves with role 'cancel' and no data. */
export type DiaryLocationSearchResult =
  | { kind: 'existing'; location: LocationModel }
  | { kind: 'new'; hit: PlaceHit }
  | { kind: 'manual'; lat: number; lng: number };

const MAX_HITS = 8;
const DEBOUNCE_MS = 300;
/** Switzerland as a whole: the view without pins and the manual fallback (spec 1.178 §5.2). */
const SWITZERLAND = { lat: 46.8, lng: 8.23, zoom: 7 };

/**
 * Turns a free-text diary place («Pfäffikon, SZ») into a location: link a saved one, take a hit of the
 * swisstopo place search, or set the pin by hand (spec 1.178 §5).
 *
 * A selection dialog, not an edit form (it is on check-forms' MODAL_ALLOWLIST): it only picks and
 * dismisses — the diary store saves and links. It must not inject that store (store↔modal cycle).
 */
@Component({
  selector: 'okr-diary-location-search-modal',
  standalone: true,
  imports: [
    Header, LeafletMap, SvgIconPipe,
    IonContent, IonSearchbar, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonIcon, IonButton,
    IonSkeletonText,
  ],
  styles: [`
    .intro { margin: 12px 16px 0; color: var(--ion-color-medium); }
    okr-leaflet-map { height: 210px; }
    ion-list { padding: 0px; }
    .number {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 50%; font-size: 0.8rem; font-weight: 600;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast);
    }
    .selected { --background: var(--ion-color-light); }
    .distance { font-variant-numeric: tabular-nums; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().locationSearch_title() }" [isModal]="true" />
    <ion-content>
      <p class="intro">{{ intro() }}</p>
      <ion-searchbar [value]="term()" [debounce]="0" (ionInput)="onInput($event)" />

      <okr-leaflet-map
        [markers]="markers()"
        [emptyView]="emptyView"
        (markerClick)="onMarkerClick($event)" />

      @if(saved().length > 0) {
        <ion-list lines="inset">
          <ion-list-header>
            <ion-label>{{ i18n().locationSearch_saved() }}</ion-label>
          </ion-list-header>
          @for(match of saved(); track match.location.okey) {
            <ion-item>
              <ion-icon slot="start" src="{{ 'location' | svgIcon }}" />
              <ion-label>
                <h3>{{ match.location.name }}</h3>
                @if(match.distanceKm !== undefined) {
                  <p class="distance">{{ distanceOf(match) }}</p>
                }
              </ion-label>
              <ion-button slot="end" fill="outline" size="small" (click)="linkSaved(match.location)">
                {{ i18n().locationSearch_link() }}
              </ion-button>
            </ion-item>
          }
        </ion-list>
      }

      <ion-list lines="inset">
        <ion-list-header>
          <ion-label>{{ i18n().locationSearch_new() }}</ion-label>
        </ion-list-header>
        @if(loading()) {
          @for(row of skeletonRows; track row) {
            <ion-item>
              <ion-label>
                <h3><ion-skeleton-text [animated]="true" style="width: 55%" /></h3>
                <p><ion-skeleton-text [animated]="true" style="width: 35%" /></p>
              </ion-label>
            </ion-item>
          }
        } @else {
          @for(hit of hits(); track $index) {
            <ion-item button [class.selected]="selected() === $index" (click)="takeHit(hit)">
              <span slot="start" class="number">{{ $index + 1 }}</span>
              <ion-label>
                <h3>{{ hit.name }}</h3>
                <p>{{ detailOf(hit) }}</p>
              </ion-label>
            </ion-item>
          } @empty {
            <ion-item lines="none">
              <ion-note>{{ i18n().locationSearch_empty() }}</ion-note>
            </ion-item>
          }
        }
        <ion-item button (click)="setManually()">
          <ion-icon slot="start" src="{{ 'location' | svgIcon }}" />
          <ion-label>{{ i18n().locationSearch_manual() }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class DiaryLocationSearchModal implements OnInit, OnDestroy {
  private readonly modalController = inject(ModalController);
  private readonly placeSearch = inject(PlaceSearchService);

  // inputs
  public label = input.required<string>();                   // the badge text, e.g. «Pfäffikon, SZ»
  public locations = input<LocationModel[]>([]);              // the tenant's saved locations
  public i18n = input.required<DiaryI18n>();

  // state
  protected readonly term = signal('');
  protected readonly hits = signal<PlaceHit[]>([]);
  protected readonly loading = signal(false);
  protected readonly selected = signal<number | undefined>(undefined);

  protected readonly skeletonRows = [1, 2, 3];
  protected readonly emptyView = SWITZERLAND;

  protected readonly intro = computed(() => fill(this.i18n().locationSearch_intro(), { label: this.label() }));

  /** Name matches on open; once a hit is selected, also the saved places near it, nearest first. */
  protected readonly saved = computed<SavedMatch[]>(() => {
    const hit = this.selectedHit();
    return hit
      ? matchSavedLocations(this.locations(), this.label(), { lat: hit.lat, lng: hit.lng })
      : matchSavedLocations(this.locations(), this.label());
  });

  protected readonly markers = computed<MapMarker[]>(() => [
    ...this.hits().map((hit, i) => ({ lat: hit.lat, lng: hit.lng, title: String(i + 1), id: `hit-${i}` })),
    ...this.saved()
      .filter(m => hasCoordinates(m.location))
      .map(m => ({ lat: m.location.latitude, lng: m.location.longitude, title: m.location.name, id: `saved-${m.location.okey}` })),
  ]);

  private readonly selectedHit = computed(() => {
    const index = this.selected();
    return index === undefined ? undefined : this.hits()[index];
  });

  private debounceTimer?: ReturnType<typeof setTimeout>;
  private requestNo = 0; // only the latest search may write its result

  public ngOnInit(): void {
    const text = searchTextOf(this.label());
    this.term.set(text);
    void this.search(text);
  }

  public ngOnDestroy(): void {
    clearTimeout(this.debounceTimer);
    this.requestNo++; // a result arriving after the close is ignored
  }

  protected onInput(event: Event): void {
    const text = String((event as CustomEvent<{ value?: string | null }>).detail?.value ?? '');
    this.term.set(text);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.search(text), DEBOUNCE_MS);
  }

  /** «Gemeinde · SZ» for a municipality, else type and municipality (swisstopo's type is German only). */
  protected detailOf(hit: PlaceHit): string {
    const parts = hit.kind === 'municipality'
      ? [this.i18n().locationSearch_municipality(), hit.canton]
      : [hit.typeLabel, hit.municipality];
    return parts.filter(p => !!p?.trim()).join(' · ');
  }

  protected distanceOf(match: SavedMatch): string {
    const km = Math.round((match.distanceKm ?? 0) * 10) / 10;
    return fill(this.i18n().locationSearch_distance(), { km });
  }

  /** A pin tap selects a hit (and re-ranks the saved places by distance) or links a saved place. */
  protected onMarkerClick(marker: MapMarker): void {
    const id = marker.id ?? '';
    if (id.startsWith('hit-')) {
      const index = Number(id.slice('hit-'.length));
      if (index >= 0 && index < this.hits().length) this.selected.set(index);
    } else if (id.startsWith('saved-')) {
      const key = id.slice('saved-'.length);
      const match = this.saved().find(m => m.location.okey === key);
      if (match) void this.linkSaved(match.location);
    }
  }

  protected linkSaved(location: LocationModel): Promise<boolean> {
    return this.close({ kind: 'existing', location });
  }

  protected takeHit(hit: PlaceHit): Promise<boolean> {
    return this.close({ kind: 'new', hit });
  }

  /** The pin starts at the selected hit, else the first hit, else Switzerland. */
  protected setManually(): Promise<boolean> {
    const hit = this.selectedHit() ?? this.hits()[0];
    const { lat, lng } = hit ?? SWITZERLAND;
    return this.close({ kind: 'manual', lat, lng });
  }

  private close(result: DiaryLocationSearchResult): Promise<boolean> {
    return dismissOverlay(this.modalController, result, 'confirm');
  }

  private async search(text: string): Promise<void> {
    const requestNo = ++this.requestNo;
    if (!text.trim()) {
      this.hits.set([]);
      this.selected.set(undefined);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    const hits = await this.placeSearch.search(text.trim()); // never throws, [] on error
    if (requestNo !== this.requestNo) return; // an older term answered late
    this.hits.set(hits.slice(0, MAX_HITS));
    this.selected.set(undefined);
    this.loading.set(false);
  }
}

function hasCoordinates(location: LocationModel): boolean {
  return Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    && !(location.latitude === 0 && location.longitude === 0);
}

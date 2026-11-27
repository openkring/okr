import { Component, computed, input, output, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSearchbar } from '@ionic/angular';

import { LocationModel, MAP_PIN_FIELDS, MapConfig, MapPinField } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, ErrorNote } from '@okr/shared-ui';
import {
  addMapLocation, applyMapLocateButton, applyMapStartPlace, applyMapStartTenant, applyMapStartView, applyMapZoom, getFieldErrors, MAP_STARTS,
  MAP_ZOOM_CHOICES, mapLocationKeysOf, MapEditorI18n, mapPinFieldsOf, mapPlaceOf, mapShowsLocateButton, MapStart, mapStartOf, MapView,
  MapZoomChoice, mapZoomChoiceOf, removeMapLocation, SectionErrors, toggleMapPinField,
} from '@okr/cms-section-util';

import { MapConfiguration } from './map-configuration';

/** at most this many search hits are listed */
const MAX_HITS = 8;

const START_ICONS: Record<MapStart, string> = { tenant: 'home', place: 'location', view: 'map' };

/**
 * The settings of a map in the map editor, shown while the map is selected on the canvas:
 * - **start**: the club's location, one of the locations (picked from a search), or the view framed on the canvas (`canvasView`);
 * - **zoom**: Land … Strasse; «Mein Standort» on or off;
 * - **pins**: the locations shown as pins (added from a search, removed one by one) and what each pin says of its location.
 * With `advanced` the stored coordinates and zoom are shown field by field above (`okr-map-config`), as the former form had them.
 * Every choice writes the stored `MapConfig` fields (`map-presets.util.ts`), so readers draw as before. Every change sets `config` once.
 */
@Component({
  selector: 'okr-map-panel',
  standalone: true,
  imports: [
    SvgIconPipe, Checkbox, ErrorNote, MapConfiguration,
    IonButton, IonCard, IonCardContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSearchbar,
  ],
  styles: [`
    .field-label { display: block; margin: 14px 0 6px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .field-label.first { margin-top: 0; }
    .note { display: block; margin-top: 6px; font-size: 0.85rem; }
    .starts { display: flex; flex-direction: column; gap: 6px; }
    .start { display: flex; align-items: center; gap: 10px; padding: 8px 10px; font: inherit; text-align: start; color: var(--ion-text-color);
      background: transparent; border: 1px solid var(--ion-color-light-shade); border-radius: 8px; cursor: pointer; }
    .start.current { border: 2px solid var(--ion-color-primary); padding: 7px 9px; }
    .start ion-icon { flex: none; font-size: 20px; color: var(--ion-color-medium); }
    .start.current ion-icon { color: var(--ion-color-primary); }
    .start small { display: block; color: var(--ion-color-medium); }
    .choices { display: flex; flex-wrap: wrap; gap: 6px; }
    .choice { min-height: 32px; padding: 4px 12px; font: inherit; font-size: 0.85rem; color: var(--ion-text-color); background: transparent;
      border: 1px solid var(--ion-color-light-shade); border-radius: 16px; cursor: pointer; }
    .choice.current { border: 2px solid var(--ion-color-primary); padding: 3px 11px; color: var(--ion-color-primary); }
    ion-searchbar { padding: 6px 0 0; --box-shadow: none; }
    ion-list { padding: 0; }
    ion-item { --padding-start: 4px; --inner-padding-end: 0; font-size: 0.9rem; }
    .pins ion-item ion-button { margin: 0; }
  `],
  template: `
    @let t = i18n();
    @if (advanced()) {
      <!-- the stored fields one by one, as the former form had them -->
      <okr-map-config [formData]="config()" (formDataChange)="configChange.emit($event)" [errors]="errors()" [readOnly]="readOnly()" [i18n]="t" />
    }

    <ion-card>
      <ion-card-content>
        <span class="field-label first">{{ t.map_editor_start_title() }}</span>
        <div class="starts" role="radiogroup" [attr.aria-label]="t.map_editor_start_title()">
          @for (s of starts; track s) {
            <button type="button" class="start" role="radio" [class.current]="s === start()" [attr.aria-checked]="s === start()" [disabled]="readOnly()" (click)="chooseStart(s)">
              <ion-icon [src]="startIcons[s] | svgIcon" aria-hidden="true" />
              <span>{{ startLabels()[s].label }}<small>{{ s === 'place' && place() ? place()!.name : startLabels()[s].helper }}</small></span>
            </button>
          }
        </div>
        @if (start() === 'place' && !readOnly()) {
          <ion-searchbar [value]="placeSearch()" (ionInput)="placeSearch.set($event.detail.value ?? '')" [placeholder]="t.map_editor_search()" [debounce]="150" />
          <ion-list>
            @for (loc of placeHits(); track loc.okey) {
              <ion-item button [detail]="false" [color]="loc.okey === place()?.okey ? 'light' : ''" (click)="choosePlace(loc)">
                <ion-label>{{ loc.name }}@if (loc.address) { <ion-note> · {{ loc.address }}</ion-note> }</ion-label>
              </ion-item>
            } @empty {
              <ion-note class="note">{{ t.map_editor_search_empty() }}</ion-note>
            }
          </ion-list>
        }
        <okr-error-note [errors]="startErrors()" />

        <span class="field-label">{{ t.map_editor_zoom_title() }}</span>
        <div class="choices" role="radiogroup" [attr.aria-label]="t.map_editor_zoom_title()">
          @for (z of zoomChoices; track z) {
            <button type="button" class="choice" role="radio" [class.current]="z === zoom()" [attr.aria-checked]="z === zoom()" [disabled]="readOnly()" (click)="chooseZoom(z)">{{ zoomLabels()[z] }}</button>
          }
        </div>
        @if (!zoom()) { <ion-note class="note">{{ t.map_editor_zoom_own() }}</ion-note> }
        <okr-error-note [errors]="errorsFor('zoom')" />

        <okr-checkbox [i18n]="locateI18n()" [checked]="showsLocate()" (checkedChange)="setLocate($event)" [toggle]="true" [showHelper]="true" [readOnly]="readOnly()" />
        <okr-error-note [errors]="errorsFor('showLocateButton')" />
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-content>
        <span class="field-label first">{{ t.map_editor_pins_title() }}</span>
        <ion-note class="note">{{ t.map_editor_pins_helper() }}</ion-note>
        <ion-list class="pins">
          @for (loc of pinLocations(); track loc.okey) {
            <ion-item [detail]="false">
              <ion-icon slot="start" [src]="'location' | svgIcon" aria-hidden="true" />
              <ion-label>{{ loc.name || loc.okey }}</ion-label>
              @if (!readOnly()) {
                <ion-button slot="end" fill="clear" size="small" color="medium" [title]="t.map_editor_pins_remove()" [attr.aria-label]="t.map_editor_pins_remove() + ' ' + loc.name" (click)="removePin(loc.okey)">
                  <ion-icon slot="icon-only" [src]="'close' | svgIcon" aria-hidden="true" />
                </ion-button>
              }
            </ion-item>
          } @empty {
            <ion-note class="note">{{ t.map_editor_pins_empty() }}</ion-note>
          }
        </ion-list>
        @if (!readOnly()) {
          @if (adding()) {
            <ion-searchbar [value]="pinSearch()" (ionInput)="pinSearch.set($event.detail.value ?? '')" [placeholder]="t.map_editor_search()" [debounce]="150" />
            <ion-list>
              @for (loc of pinHits(); track loc.okey) {
                <ion-item button [detail]="false" (click)="addPin(loc.okey)">
                  <ion-label>{{ loc.name }}@if (loc.address) { <ion-note> · {{ loc.address }}</ion-note> }</ion-label>
                </ion-item>
              } @empty {
                <ion-note class="note">{{ t.map_editor_search_empty() }}</ion-note>
              }
            </ion-list>
          } @else {
            <ion-button fill="clear" size="small" (click)="adding.set(true)">
              <ion-icon slot="start" [src]="'add' | svgIcon" aria-hidden="true" />{{ t.map_editor_pins_add() }}
            </ion-button>
          }
        }
        <okr-error-note [errors]="errorsFor('locationKeys')" />

        @if (pinLocations().length > 0 || errorsFor('pinFields').length > 0) {
          <span class="field-label">{{ t.map_editor_pins_fields() }}</span>
          <div class="choices" role="group" [attr.aria-label]="t.map_editor_pins_fields()">
            @for (f of pinFieldChoices; track f) {
              <button type="button" class="choice" [class.current]="pinFields().includes(f)" [attr.aria-pressed]="pinFields().includes(f)" [disabled]="readOnly()" (click)="togglePinField(f)">{{ pinFieldLabels()[f] }}</button>
            }
          </div>
          <okr-error-note [errors]="errorsFor('pinFields')" />
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class MapPanel {
  // inputs
  public readonly config = input.required<MapConfig>();
  /** every location of the tenant: the places a map can start at and the pins it can show */
  public readonly locations = input<LocationModel[]>([]);
  /** the view framed on the canvas, taken by «Dieser Ausschnitt» */
  public readonly canvasView = input<MapView | undefined>(undefined);
  /** shows the stored coordinates and zoom field by field (the toggle in the panel's title) */
  public readonly advanced = input(false);
  public readonly errors = input<SectionErrors>({});
  public readonly readOnly = input(false);
  public readonly i18n = input.required<MapEditorI18n>();

  // outputs
  public readonly configChange = output<MapConfig>();

  // constants for the template
  protected readonly starts = MAP_STARTS;
  protected readonly startIcons = START_ICONS;
  protected readonly zoomChoices = MAP_ZOOM_CHOICES;
  protected readonly pinFieldChoices = MAP_PIN_FIELDS;

  // start
  /** «Ein Ort» chosen, no location picked yet: shown as chosen while the search is open */
  private readonly picking = signal(false);
  protected readonly place = computed(() => mapPlaceOf(this.config(), this.locations()));
  protected readonly start = computed<MapStart>(() => (this.picking() ? 'place' : mapStartOf(this.config(), this.locations())));
  protected readonly placeSearch = signal('');
  protected readonly placeHits = computed(() => this.search(this.locations(), this.placeSearch()));
  protected readonly startErrors = computed(() => ['centerLatitude', 'centerLongitude', 'useCurrentLocationAsCenter'].flatMap((field) => this.errorsFor(field)));

  // zoom, «Mein Standort»
  protected readonly zoom = computed(() => mapZoomChoiceOf(this.config().zoom));
  protected readonly showsLocate = computed(() => mapShowsLocateButton(this.config()));

  // pins
  protected readonly pinFields = computed(() => mapPinFieldsOf(this.config()));
  protected readonly pinLocations = computed(() => {
    const byKey = new Map(this.locations().map((l) => [l.okey, l]));
    return mapLocationKeysOf(this.config()).map((key) => byKey.get(key) ?? ({ okey: key, name: '' } as LocationModel));
  });
  protected readonly adding = signal(false);
  protected readonly pinSearch = signal('');
  protected readonly pinHits = computed(() => {
    const chosen = new Set(mapLocationKeysOf(this.config()));
    return this.search(this.locations().filter((l) => !chosen.has(l.okey)), this.pinSearch());
  });

  // texts
  protected readonly startLabels = computed<Record<MapStart, { label: string; helper: string }>>(() => {
    const t = this.i18n();
    return {
      tenant: { label: t.map_editor_start_tenant(), helper: t.map_editor_start_tenant_helper() },
      place: { label: t.map_editor_start_place(), helper: t.map_editor_start_place_helper() },
      view: { label: t.map_editor_start_view(), helper: t.map_editor_start_view_helper() },
    };
  });
  protected readonly zoomLabels = computed<Record<MapZoomChoice, string>>(() => {
    const t = this.i18n();
    return { country: t.map_editor_zoom_country(), region: t.map_editor_zoom_region(), city: t.map_editor_zoom_city(), quarter: t.map_editor_zoom_quarter(), street: t.map_editor_zoom_street() };
  });
  protected readonly pinFieldLabels = computed<Record<MapPinField, string>>(() => {
    const t = this.i18n();
    return { name: t.map_editor_pin_name(), address: t.map_editor_pin_address(), what3words: t.map_editor_pin_what3words(), seaLevel: t.map_editor_pin_seaLevel(), notes: t.map_editor_pin_notes() };
  });
  protected readonly locateI18n = computed(() => ({
    name: 'showLocateButton', label: this.i18n().map_editor_locate_label(), helper: this.i18n().map_editor_locate_helper(),
  } as CheckboxI18n));

  /************************************** actions *********************************************** */
  protected chooseStart(start: MapStart): void {
    this.picking.set(start === 'place' && !this.place());
    if (start === 'tenant') this.emit(applyMapStartTenant(this.config()));
    if (start === 'view') {
      const view = this.canvasView();
      const config = this.config();
      this.emit(applyMapStartView(config, view ?? { lat: config.centerLatitude, lng: config.centerLongitude, zoom: config.zoom }));
    }
  }

  protected choosePlace(location: LocationModel): void {
    this.picking.set(false);
    this.placeSearch.set('');
    this.emit(applyMapStartPlace(this.config(), location));
  }

  protected chooseZoom(choice: MapZoomChoice): void {
    this.emit(applyMapZoom(this.config(), choice));
  }

  protected setLocate(show: boolean): void {
    if (show !== this.showsLocate()) this.emit(applyMapLocateButton(this.config(), show));
  }

  protected addPin(key: string): void {
    this.pinSearch.set('');
    this.adding.set(false);
    this.emit(addMapLocation(this.config(), key));
  }

  protected removePin(key: string): void {
    this.emit(removeMapLocation(this.config(), key));
  }

  protected togglePinField(field: MapPinField): void {
    this.emit(toggleMapPinField(this.config(), field));
  }

  private emit(config: MapConfig): void {
    if (config !== this.config()) this.configChange.emit(config);
  }

  /** locations with coordinates whose name or address holds the search, the first few */
  private search(locations: readonly LocationModel[], term: string): LocationModel[] {
    const needle = term.trim().toLowerCase();
    return locations
      .filter((l) => l.latitude !== 0 || l.longitude !== 0)
      .filter((l) => !needle || `${l.name} ${l.address}`.toLowerCase().includes(needle))
      .slice(0, MAX_HITS);
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}

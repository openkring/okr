import { Component, computed, inject, input, linkedSignal, model, Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, switchMap } from 'rxjs';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow,
  IonSelect, IonSelectOption
} from '@ionic/angular';

import { DeparturesConfig } from '@okr/shared-models';
import { LocationService } from '@okr/location-data-access';
import { TransitService } from '@okr/mobility-transit-data-access';
import { TransitStop, inSwitzerland, locationPoint } from '@okr/mobility-transit-util';

import { WeatherLocationOption } from './weather-configuration';

interface DeparturesConfigI18n {
  departures_title:           Signal<string>;
  departures_location_label:  Signal<string>;
  departures_location_helper: Signal<string>;
  departures_stop_label:      Signal<string>;
  departures_stop_nearest:    Signal<string>;
  departures_stop_helper:     Signal<string>;
  departures_limit_label:     Signal<string>;
  departures_walk_label:      Signal<string>;
  departures_walk_helper:     Signal<string>;
}

const LIMITS = [3, 4, 5, 6, 8, 10, 12, 15, 20];
const WALKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30];
/** the radius the board itself searches its nearest stop in (spec 1.130 §4) */
const NEAR_RADIUS_M = 1000;

/**
 * Configuration of a departures section (spec 1.130 §6.4): the place (empty ⇒ the page's location), the stop
 * (empty ⇒ the nearest one; the stops around the chosen place are offered for pinning), how many departures and
 * the walk to the stop (– ⇒ derived from the distance). Limit and walk are selects, so they cannot leave the
 * range the suite checks.
 */
@Component({
  selector: 'okr-departures-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote,
    IonSelect, IonSelectOption
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().departures_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().departures_location_label()" labelPlacement="stacked"
                          [value]="locationKey()" [disabled]="readOnly()"
                          [placeholder]="i18n().departures_location_helper()"
                          (ionChange)="onLocation($event.detail.value)">
                <ion-select-option value="">–</ion-select-option>
                @for (loc of locations(); track loc.okey) {
                  <ion-select-option [value]="loc.okey">{{ loc.name }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().departures_stop_label()" labelPlacement="stacked"
                          [value]="stopRef()" [disabled]="readOnly()"
                          (ionChange)="onStop($event.detail.value)">
                <ion-select-option value="">{{ i18n().departures_stop_nearest() }}</ion-select-option>
                @for (stop of stopOptions(); track stop.stopRef) {
                  <ion-select-option [value]="stop.stopRef">{{ stop.label }}</ion-select-option>
                }
              </ion-select>
              <ion-note>{{ i18n().departures_stop_helper() }}</ion-note>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().departures_limit_label()" labelPlacement="stacked"
                          [value]="limit()" [disabled]="readOnly()"
                          (ionChange)="onLimit($event.detail.value)">
                @for (n of limits; track n) {
                  <ion-select-option [value]="n">{{ n }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().departures_walk_label()" labelPlacement="stacked"
                          [value]="walk()" [disabled]="readOnly()"
                          [placeholder]="i18n().departures_walk_helper()"
                          (ionChange)="onWalk($event.detail.value)">
                <ion-select-option [value]="-1">–</ion-select-option>
                @for (n of walks; track n) {
                  <ion-select-option [value]="n">{{ n }}'</ion-select-option>
                }
              </ion-select>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class DeparturesConfiguration {
  private readonly locationService = inject(LocationService);
  private readonly transitService = inject(TransitService);

  public formData = model.required<DeparturesConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<DeparturesConfigI18n>();
  /** All locations the tenant may pick from. */
  public readonly locations = input<WeatherLocationOption[]>([]);

  protected readonly limits = LIMITS;
  protected readonly walks = WALKS;

  protected locationKey = linkedSignal(() => this.formData().locationKey ?? '');
  protected stopRef = linkedSignal(() => this.formData().stopRef ?? '');
  protected limit = linkedSignal(() => this.formData().limit ?? 8);
  protected walk = linkedSignal(() => this.formData().walkMinutes ?? -1);

  /** The stops around the chosen place, nearest first; [] without a place, abroad or offline. */
  private readonly stops = toSignal(
    toObservable(this.locationKey).pipe(
      distinctUntilChanged(),
      switchMap((key) => (key ? this.locationService.read(key) : of(undefined))),
      map((loc) => locationPoint(loc)),
      switchMap((p) => (p && inSwitzerland(p)
        ? from(this.transitService.searchStops({ near: { ...p, radiusM: NEAR_RADIUS_M }, limit: 10 })).pipe(
          map((res) => res.stops),
          catchError(() => of([] as TransitStop[])),
        )
        : of([] as TransitStop[]))),
    ),
    { initialValue: [] as TransitStop[] },
  );

  /** The stops on offer; a pinned stop that is not among them (another place, offline) is kept by its name. */
  protected readonly stopOptions = computed(() => {
    const options = this.stops().map((s) => ({ stopRef: s.stopRef, label: s.distanceM ? `${s.name} · ${s.distanceM} m` : s.name }));
    const pinned = this.formData().stopRef;
    if (pinned && !options.some((o) => o.stopRef === pinned)) options.push({ stopRef: pinned, label: this.formData().stopName || pinned });
    return options;
  });

  protected onLocation(value: unknown): void {
    // a pinned stop belongs to the old place
    this.formData.update((vm) => ({ ...vm, locationKey: String(value ?? ''), stopRef: '', stopName: '' }));
  }

  protected onStop(value: unknown): void {
    const stopRef = String(value ?? '');
    const stopName = this.stops().find((s) => s.stopRef === stopRef)?.name ?? (stopRef === this.formData().stopRef ? this.formData().stopName : '');
    this.formData.update((vm) => ({ ...vm, stopRef, stopName: stopRef ? stopName : '' }));
  }

  protected onLimit(value: unknown): void {
    const limit = Number(value);
    if (Number.isInteger(limit)) this.formData.update((vm) => ({ ...vm, limit }));
  }

  protected onWalk(value: unknown): void {
    const walkMinutes = Number(value);
    if (Number.isInteger(walkMinutes)) this.formData.update((vm) => ({ ...vm, walkMinutes }));
  }
}

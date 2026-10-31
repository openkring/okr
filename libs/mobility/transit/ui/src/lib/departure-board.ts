import { Component, computed, input, signal } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';

import {
  DepartureMode, DeparturesI18n, TransitDeparture, TransitSituation, clockTime, delayMinutes, minutesUntil,
} from '@okr/mobility-transit-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';

/** Icon per mode; the icon set has no tram or cableway, a tram reads well enough as a train. */
const MODE_ICON: Record<DepartureMode, string> = { train: 'train', bus: 'bus', tram: 'train', ship: 'ship', cableway: '', other: '' };

/**
 * The departure board (spec 1.130 §6.2), dumb: the stop, the disruption messages in force, then one row per
 * departure — timetabled time with the realtime delay, countdown, line, destination, platform or bay. Announced
 * (not yet active) messages sit behind a toggle. The host decides which departures are shown and when `now` ticks.
 */
@Component({
  selector: 'okr-departure-board',
  standalone: true,
  imports: [SvgIconPipe, IonList, IonItem, IonLabel, IonIcon, IonButton],
  styles: [`
    :host { display: block; }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 12px; margin-bottom: 8px; }
    .stop { font-weight: 600; }
    .muted { color: var(--ion-color-medium); font-size: 0.85em; }
    .situations { padding: 0; margin-bottom: 8px; }
    .situations ion-item { --padding-start: 8px; --inner-padding-end: 8px; --min-height: 0; border-radius: 6px; margin-bottom: 4px; }
    .situations ion-label { margin: 6px 0; }
    .situation-detail { display: block; margin-top: 4px; font-size: 0.9em; }
    .rows { display: grid; grid-template-columns: max-content max-content max-content 1fr max-content; column-gap: 12px; align-items: center; }
    .row { display: contents; }
    .row > * { padding: 6px 0; border-bottom: 1px solid var(--ion-color-light-shade); }
    .time { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .countdown { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .line { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; white-space: nowrap; }
    .line ion-icon { font-size: 1.1em; color: var(--ion-color-medium); }
    .destination { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .destination ion-icon { vertical-align: -2px; margin-left: 4px; }
    .quay { text-align: right; white-space: nowrap; color: var(--ion-color-medium); }
    .late, .cancel { color: var(--ion-color-danger); }
    .cancelled .time, .cancelled .line, .cancelled .destination { text-decoration: line-through; }
    .stale .rows { opacity: 0.5; }
    .credit { font-size: 0.75rem; color: var(--ion-color-medium); margin-top: 8px; }
    .credit a { color: inherit; }
    /* the kiosk: read from a step away */
    :host(.large) { font-size: 1.4rem; }
    :host(.large) .row > * { padding: 10px 0; }
    @media (width <= 480px) {
      .rows { column-gap: 8px; }
      .quay { font-size: 0.85em; }
    }
  `],
  host: { '[class.large]': "size() === 'large'" },
  template: `
    <div [class.stale]="stale()">
      <div class="head">
        <span class="stop">{{ header() }}</span>
        @if (asOf()) { <span class="muted">{{ asOf() }}</span> }
      </div>

      @if (active().length || upcoming().length) {
        <ion-list class="situations" lines="none">
          @for (s of active(); track s.id) {
            <ion-item color="warning" button="true" [detail]="false" (click)="toggle(s.id)">
              <ion-icon slot="start" src="{{ 'warning' | svgIcon }}" />
              <ion-label class="ion-text-wrap">
                <strong>{{ i18n().disruption() }}:</strong> {{ s.summary }}
                @if (open() === s.id && s.detail) { <span class="situation-detail">{{ s.detail }}</span> }
              </ion-label>
            </ion-item>
          }
          @if (showUpcoming()) {
            @for (s of upcoming(); track s.id) {
              <ion-item color="light" button="true" [detail]="false" (click)="toggle(s.id)">
                <ion-icon slot="start" src="{{ 'alert-circle' | svgIcon }}" />
                <ion-label class="ion-text-wrap">
                  <strong>{{ i18n().announced() }}:</strong> {{ s.summary }}
                  @if (open() === s.id && s.detail) { <span class="situation-detail">{{ s.detail }}</span> }
                </ion-label>
              </ion-item>
            }
          }
          @if (upcoming().length) {
            <ion-button fill="clear" size="small" (click)="showUpcoming.set(!showUpcoming())">{{ upcomingToggle() }}</ion-button>
          }
        </ion-list>
      }

      @if (stale()) { <p class="muted">{{ i18n().stale() }}</p> }

      @if (rows().length) {
        <div class="rows" role="table">
          @for (r of rows(); track r.key) {
            <div class="row" role="row" [class.cancelled]="r.cancelled">
              <span class="time" role="cell">{{ r.time }} @if (r.delay) { <span class="late">{{ r.delay }}</span> }</span>
              <span class="countdown" role="cell" [class.cancel]="r.cancelled">{{ r.status }}</span>
              <span class="line" role="cell">
                @if (r.icon) { <ion-icon src="{{ r.icon | svgIcon }}" /> }
                {{ r.line }}
              </span>
              <span class="destination" role="cell">
                {{ r.destination }}
                @if (r.affected) { <ion-icon color="warning" src="{{ 'warning' | svgIcon }}" [attr.aria-label]="i18n().affected()" /> }
              </span>
              <span class="quay" role="cell">{{ r.quay }}</span>
            </div>
          }
        </div>
      } @else {
        <p class="muted">{{ i18n().empty() }}</p>
      }

      @if (attribution(); as a) {
        <p class="credit">{{ i18n().source() }} <a [href]="a.url" target="_blank" rel="noopener noreferrer">{{ a.provider }}</a></p>
      }
    </div>
  `,
})
export class DepartureBoard {
  public readonly stopName = input('');
  /** walking distance from the place to the stop; 0 ⇒ not shown */
  public readonly distanceM = input(0);
  /** the departures to show, already filtered and ordered by the host */
  public readonly departures = input.required<TransitDeparture[]>();
  public readonly situations = input<TransitSituation[]>([]);
  /** epoch ms the countdown is computed from */
  public readonly now = input.required<number>();
  /** ISO time of the answer shown, for «Stand 14:32» */
  public readonly fetchedAt = input('');
  public readonly stale = input(false);
  public readonly attribution = input<{ provider: string; url: string } | undefined>(undefined);
  public readonly i18n = input.required<DeparturesI18n>();
  public readonly size = input<'compact' | 'large'>('compact');

  protected readonly open = signal('');
  protected readonly showUpcoming = signal(false);

  protected readonly header = computed(() => {
    const d = this.distanceM();
    return d > 0 ? `${this.stopName()} · ${fill(this.i18n().distance(), { distance: d })}` : this.stopName();
  });
  protected readonly asOf = computed(() => {
    const t = clockTime(this.fetchedAt());
    return t ? fill(this.i18n().as_of(), { time: t }) : '';
  });

  protected readonly active = computed(() => this.situations().filter((s) => s.active));
  protected readonly upcoming = computed(() => this.situations().filter((s) => !s.active));
  protected readonly upcomingToggle = computed(() => this.showUpcoming()
    ? this.i18n().upcoming_hide()
    : fill(this.i18n().upcoming_show(), { count: this.upcoming().length }));

  protected readonly rows = computed(() => {
    const i18n = this.i18n();
    const now = this.now();
    const activeIds = new Set(this.active().map((s) => s.id));
    return this.departures().map((d, i) => {
      const delay = delayMinutes(d);
      const minutes = minutesUntil(d, now);
      let status = '';
      if (d.cancelled) status = i18n.cancelled();
      else if (minutes === 0) status = i18n.now();
      else if (minutes < 60) status = fill(i18n.in_minutes(), { minutes });
      return {
        key: `${d.plannedAt}|${d.line}|${d.destination}|${i}`,
        time: clockTime(d.plannedAt),
        delay: !d.cancelled && delay >= 1 ? fill(i18n.delay(), { minutes: delay }) : '',
        status,
        icon: MODE_ICON[d.mode],
        line: d.line,
        destination: d.destination,
        quay: d.quay ? fill(d.mode === 'train' ? i18n.quay_train() : i18n.quay_other(), { quay: d.quay }) : '',
        cancelled: d.cancelled,
        affected: d.situationIds.some((id) => activeIds.has(id)),
      };
    });
  });

  protected toggle(id: string): void {
    this.open.update((o) => (o === id ? '' : id));
  }
}

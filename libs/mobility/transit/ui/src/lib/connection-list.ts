import { Component, computed, input, model, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import {
  TransitAnchor, TransitConnection, TransitI18n, arrivesLate, changeMarks, clockTime, connectionKey, durationLabel,
  firstDelay, firstRide, groupByZurichDay, isCancelled, lineSummary, transfers,
} from '@okr/mobility-transit-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';

import { ConnectionDetail } from './connection-detail';

/**
 * «Verbindung wählen.» (spec 1.162 §5.2): SBB-style rows with the first ride's line badge and direction, departure →
 * arrival around a timeline bar with one dot per change, platform, duration and the realtime delay. Day headers when the
 * results cross midnight. Tapping a row expands its legs; paging and the calendar action are opt-in.
 * With `arriveBy`, a connection arriving after `at` is marked.
 */
@Component({
  selector: 'okr-connection-list',
  standalone: true,
  imports: [ConnectionDetail, SvgIconPipe, IonButton, IonIcon],
  styles: [`
    :host { display: block; }
    .choose { margin: 8px 0; font-weight: 600; font-size: 1.1rem; }
    .paging { display: block; width: 100%; margin: 4px 0; }
    .day { margin: 14px 0 6px; font-weight: 600; color: var(--ion-color-medium); text-transform: capitalize; }
    .row {
      display: block; width: 100%; text-align: left; font: inherit; color: var(--ion-text-color, inherit);
      background: var(--ion-item-background, var(--ion-background-color, transparent));
      border: 1px solid var(--ion-color-step-150, var(--ion-color-light-shade, #d7d8da)); border-radius: 8px;
      padding: 10px 12px; margin: 0; cursor: pointer;
    }
    .row[aria-expanded='true'] { border-color: var(--ion-color-primary); }
    .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .badge {
      flex: none; padding: 1px 8px; border-radius: 4px; font-weight: 700; font-size: 0.85rem;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast);
    }
    .direction { color: var(--ion-color-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timeline { display: flex; align-items: center; gap: 10px; margin: 8px 0 4px; }
    .time { font-weight: 600; font-size: 1.05rem; font-variant-numeric: tabular-nums; }
    .bar { position: relative; flex: 1; height: 2px; background: var(--ion-text-color, #222); opacity: 0.85; }
    .dot {
      position: absolute; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%;
      background: var(--ion-background-color, #fff); border: 2px solid var(--ion-text-color, #222); box-sizing: border-box;
    }
    .dot.end { background: var(--ion-text-color, #222); }
    .foot { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .foot .spacer { flex: 1; }
    .warn { color: var(--ion-color-danger); font-weight: 600; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0 0 12px; }
    ion-icon { font-size: 16px; vertical-align: text-bottom; }
    .expand { margin: 4px 0 8px; }
  `],
  template: `
    <div class="choose">{{ i18n().choose() }}</div>
    @if (paging()) {
      <ion-button class="paging" fill="outline" size="small" [disabled]="loadingEarlier()" (click)="earlier.emit()">
        {{ i18n().earlier() }}
      </ion-button>
    }
    @for (group of groups(); track group.day) {
      @if (showDays()) { <div class="day">{{ group.label }}</div> }
      @for (row of group.rows; track row.key) {
        <button type="button" class="row" [attr.aria-expanded]="expandedKey() === row.key" (click)="toggle(row.key)">
          <div class="head">
            @if (row.line) { <span class="badge">{{ row.line }}</span> }
            @if (row.direction) { <span class="direction">{{ i18n().direction() }} {{ row.direction }}</span> }
            @if (row.cancelled) { <span class="warn">{{ i18n().cancelled() }}</span> }
          </div>
          <div class="timeline">
            <span class="time">{{ row.dep }}</span>
            <span class="bar">
              <span class="dot" style="left: 0"></span>
              @for (m of row.marks; track $index) { <span class="dot" [style.left]="'calc(' + m + ' * 100%)'"></span> }
              <span class="dot end" style="left: 100%"></span>
            </span>
            <span class="time">{{ row.arr }}</span>
          </div>
          <div class="foot">
            @if (row.platform) { <span>{{ row.platform }}</span> }
            <span>{{ row.transfers }}</span>
            <span class="spacer"></span>
            <span>{{ row.duration }}</span>
            @if (row.delay > 0) { <span class="warn">⚠ {{ row.delayLabel }}</span> }
            @if (row.late) { <span class="warn">⚠ {{ i18n().late() }}</span> }
          </div>
        </button>
        @if (expandedKey() === row.key) {
          <okr-connection-detail class="expand" [connection]="row.connection" [i18n]="i18n()" />
          <div class="actions">
            @if (canAddToCalendar()) {
              <ion-button size="small" (click)="addToCalendar.emit(row.connection)">
                <ion-icon slot="start" src="{{ 'calendar' | svgIcon }}" />{{ i18n().add_calendar() }}
              </ion-button>
            }
            <ion-button size="small" fill="outline" (click)="openSbb.emit(row.connection)">
              <ion-icon slot="start" src="{{ 'open' | svgIcon }}" />{{ i18n().buy_ticket() }}
            </ion-button>
          </div>
        }
      }
    }
    @if (paging()) {
      <ion-button class="paging" fill="outline" size="small" [disabled]="loadingLater()" (click)="later.emit()">
        {{ i18n().later() }}
      </ion-button>
    }
  `,
})
export class ConnectionList {
  public readonly connections = input.required<TransitConnection[]>();
  public readonly i18n = input.required<TransitI18n>();
  /** the search time and its meaning, to mark connections that arrive too late */
  public readonly at = input('');
  public readonly anchor = input<TransitAnchor>('departAt');
  /** language of the day headers */
  public readonly lang = input('de');
  /** shows the «Frühere/Spätere Verbindungen» buttons */
  public readonly paging = input(false);
  public readonly loadingEarlier = input(false);
  public readonly loadingLater = input(false);
  public readonly canAddToCalendar = input(false);
  /** key (`connectionKey`) of the expanded row, '' for none; two-way, so the list also works uncontrolled */
  public readonly expandedKey = model('');

  public readonly earlier = output<void>();
  public readonly later = output<void>();
  public readonly addToCalendar = output<TransitConnection>();
  public readonly openSbb = output<TransitConnection>();

  protected readonly showDays = computed(() => this.groups().length > 1);

  protected readonly groups = computed(() => {
    const i18n = this.i18n();
    const fmt = new Intl.DateTimeFormat(this.lang(), {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich',
    });
    return groupByZurichDay(this.connections()).map((g) => ({
      day: g.day,
      label: fmt.format(new Date(Date.parse(g.connections[0].departure))),
      rows: g.connections.map((c) => {
        const n = transfers(c);
        const delay = firstDelay(c);
        const ride = firstRide(c);
        return {
          key: connectionKey(c),
          connection: c,
          line: ride?.line ?? lineSummary(c),
          direction: ride?.direction ?? '',
          platform: ride?.platform ? fill(i18n.platform(), { platform: ride.platform }) : '',
          dep: clockTime(c.departure),
          arr: clockTime(c.arrival),
          marks: changeMarks(c),
          duration: durationLabel(c.durationMinutes),
          transfers: n === 0 ? i18n.direct() : n === 1 ? i18n.transfers_one() : fill(i18n.transfers_many(), { count: n }),
          delay,
          delayLabel: fill(i18n.delay(), { minutes: delay }),
          cancelled: isCancelled(c),
          late: this.anchor() === 'arriveBy' && arrivesLate(c, this.at()),
        };
      }),
    }));
  });

  protected toggle(key: string): void {
    this.expandedKey.update((k) => (k === key ? '' : key));
  }
}

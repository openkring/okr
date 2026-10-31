import { Component, computed, input, signal } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';

import {
  TransitAnchor, TransitConnection, TransitI18n, arrivesLate, clockTime, durationLabel, firstDelay, isCancelled,
  lineSummary, transfers,
} from '@okr/mobility-transit-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';

import { ConnectionDetail } from './connection-detail';

/**
 * Up to a handful of connections (spec 1.131 §3.3): departure → arrival, duration, changes, lines and the realtime
 * delay of the first ride. Tapping a row shows its legs. With `arriveBy`, a connection arriving after `at` is marked.
 */
@Component({
  selector: 'okr-connection-list',
  standalone: true,
  imports: [ConnectionDetail, SvgIconPipe, IonList, IonItem, IonLabel, IonIcon, IonNote],
  styles: [`
    ion-list { padding: 0; }
    ion-item { --padding-start: 0; --inner-padding-end: 0; }
    .times { font-weight: 600; font-variant-numeric: tabular-nums; }
    .meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .warn { color: var(--ion-color-danger); }
    ion-icon { font-size: 16px; }
  `],
  template: `
    <ion-list lines="full">
      @for (row of rows(); track $index) {
        <ion-item button="true" [detail]="false" (click)="toggle($index)">
          <ion-label class="ion-text-wrap">
            <div class="times">{{ row.dep }} → {{ row.arr }} <ion-note>{{ row.duration }}</ion-note></div>
            <div class="meta">
              <span>{{ row.transfers }}</span>
              <span>{{ row.lines }}</span>
              @if (row.delay > 0) { <span class="warn">{{ row.delayLabel }}</span> }
              @if (row.cancelled) { <span class="warn">{{ i18n().cancelled() }}</span> }
              @if (row.late) { <span class="warn">⚠ {{ i18n().late() }}</span> }
            </div>
          </ion-label>
          <ion-icon slot="end" src="{{ (open() === $index ? 'chevron-up' : 'chevron-down') | svgIcon }}" />
        </ion-item>
        @if (open() === $index) {
          <okr-connection-detail [connection]="row.connection" [i18n]="i18n()" />
        }
      }
    </ion-list>
  `,
})
export class ConnectionList {
  public readonly connections = input.required<TransitConnection[]>();
  public readonly i18n = input.required<TransitI18n>();
  /** the search time and its meaning, to mark connections that arrive too late */
  public readonly at = input('');
  public readonly anchor = input<TransitAnchor>('departAt');

  protected readonly open = signal(-1);

  protected readonly rows = computed(() => {
    const i18n = this.i18n();
    return this.connections().map((c) => {
      const n = transfers(c);
      const delay = firstDelay(c);
      return {
        connection: c,
        dep: clockTime(c.departure),
        arr: clockTime(c.arrival),
        duration: durationLabel(c.durationMinutes),
        transfers: n === 0 ? i18n.direct() : n === 1 ? i18n.transfers_one() : fill(i18n.transfers_many(), { count: n }),
        lines: lineSummary(c),
        delay,
        delayLabel: fill(i18n.delay(), { minutes: delay }),
        cancelled: isCancelled(c),
        late: this.anchor() === 'arriveBy' && arrivesLate(c, this.at()),
      };
    });
  });

  protected toggle(index: number): void {
    this.open.update((o) => (o === index ? -1 : index));
  }
}

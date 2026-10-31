import { Component, computed, input } from '@angular/core';

import { TransitConnection, TransitI18n, clockTime, durationLabel } from '@okr/mobility-transit-util';
import { fill } from '@okr/shared-util-core';

/** The legs of one connection: rides with line, stops, platform and times; walks and changes with their minutes. */
@Component({
  selector: 'okr-connection-detail',
  standalone: true,
  styles: [`
    :host { display: block; padding: 4px 0 8px 12px; border-left: 3px solid var(--ion-color-light-shade, #d7d8da); }
    .leg { padding: 4px 0; font-size: 0.9rem; }
    .ride .line { font-weight: 600; margin-right: 6px; }
    .ride .direction { color: var(--ion-color-medium); }
    .stop { display: flex; gap: 8px; }
    .stop .time { width: 44px; font-variant-numeric: tabular-nums; }
    .stop .platform { margin-left: auto; color: var(--ion-color-medium); }
    .foot { color: var(--ion-color-medium); font-style: italic; }
    .delay { color: var(--ion-color-danger); margin-left: 4px; }
    .cancelled { color: var(--ion-color-danger); font-weight: 600; }
  `],
  template: `
    @for (leg of legs(); track $index) {
      @if (leg.kind === 'ride') {
        <div class="leg ride">
          <div>
            <span class="line">{{ leg.line }}</span>
            @if (leg.direction) { <span class="direction">{{ i18n().direction() }} {{ leg.direction }}</span> }
            @if (leg.cancelled) { <span class="cancelled"> · {{ i18n().cancelled() }}</span> }
          </div>
          <div class="stop">
            <span class="time">{{ leg.dep }}</span>
            <span>{{ leg.from }}@if (leg.departureDelay > 0) {<span class="delay">+{{ leg.departureDelay }}'</span>}</span>
            @if (leg.platform) { <span class="platform">{{ leg.platformLabel }}</span> }
          </div>
          <div class="stop">
            <span class="time">{{ leg.arr }}</span>
            <span>{{ leg.to }}@if (leg.arrivalDelay > 0) {<span class="delay">+{{ leg.arrivalDelay }}'</span>}</span>
          </div>
        </div>
      } @else {
        <div class="leg foot">
          {{ leg.kind === 'walk' ? i18n().walk() : i18n().transfer() }} {{ leg.duration }}
        </div>
      }
    }
  `,
})
export class ConnectionDetail {
  public readonly connection = input.required<TransitConnection>();
  public readonly i18n = input.required<TransitI18n>();

  protected readonly legs = computed(() =>
    this.connection().legs.map((l) => ({
      ...l,
      dep: clockTime(l.departure),
      arr: clockTime(l.arrival),
      duration: durationLabel(l.durationMinutes),
      platformLabel: fill(this.i18n().platform(), { platform: l.platform }),
    })),
  );
}

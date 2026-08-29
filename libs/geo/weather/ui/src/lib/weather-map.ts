import { Component, computed, input } from '@angular/core';

import { WeatherDaily } from '@okr/shared-models';
import { SWISS_MAP_VIEWBOX, projectToSwissMap } from '@okr/weather-util';

import { WeatherDayPill } from './weather-day-pill';

/** One location to show on the map. */
export interface WeatherMapPin {
  locationKey: string;
  name: string;
  latitude: number;
  longitude: number;
  daily: WeatherDaily;
}

/**
 * `map` — 4 to 10 locations on an outline of Switzerland, each as a `day-horizontal` pill.
 *
 * The outline is a static SVG path, not a tile layer: the widget shows an overview at one
 * fixed zoom with no panning, so Leaflet plus a tile provider would buy nothing and cost a
 * library. `rain_radar` is the widget that genuinely needs a map, and it loads one lazily.
 */
@Component({
  selector: 'okr-weather-map',
  standalone: true,
  imports: [WeatherDayPill],
  styles: [`
    :host { display: block; }
    .frame {
      position: relative; width: 100%; border-radius: 6px; overflow: hidden;
      background: var(--ion-color-step-100, #f2f4f8);
    }
    svg { position: absolute; inset: 0; display: block; }
    .land { fill: #7FA98C; stroke: #5f8a6d; stroke-width: 1.5; stroke-linejoin: round; }
    .water { fill: #9CC7E8; }
    .pin { position: absolute; transform: translateY(-50%); }
    .credit {
      position: absolute; right: 8px; bottom: 6px; font-size: 11px; border-radius: 4px;
      padding: 2px 7px; opacity: 0.9;
      color: var(--ion-color-medium, #5f5f5f); background: var(--ion-card-background, #fff);
    }
    .empty { padding: 20px 0; color: var(--ion-color-medium, #5f5f5f); font-size: 14px; }
  `],
  template: `
    @if (pins().length) {
      <div class="frame" [style.aspect-ratio]="ratio">
        <svg [attr.viewBox]="'0 0 ' + vb.width + ' ' + vb.height" preserveAspectRatio="xMidYMid meet">
          <path class="land" [attr.d]="outline" />
          <g class="water">
            <path d="M60,532 L150,516 L235,527 L300,520 L296,536 L230,545 L150,540 L70,546 Z" />
            <ellipse cx="243" cy="290" rx="52" ry="16" transform="rotate(-38 243 290)" />
            <ellipse cx="627" cy="181" rx="46" ry="11" transform="rotate(-34 627 181)" />
            <ellipse cx="716" cy="112" rx="58" ry="14" transform="rotate(-16 716 112)" />
            <ellipse cx="520" cy="256" rx="40" ry="13" transform="rotate(18 520 256)" />
            <ellipse cx="664" cy="566" rx="16" ry="34" transform="rotate(14 664 566)" />
          </g>
        </svg>

        @for (p of placed(); track p.locationKey) {
          <div class="pin" [style.left.%]="p.left" [style.top.%]="p.top">
            <okr-weather-day-pill [daily]="p.daily" [locationName]="p.name" [height]="40" />
          </div>
        }

        @if (credit()) { <div class="credit">{{ credit() }}</div> }
      </div>
    } @else {
      <div class="empty">{{ emptyLabel() }}</div>
    }
  `
})
export class WeatherMap {
  public pins = input.required<WeatherMapPin[]>();
  public credit = input('');
  public emptyLabel = input('');

  protected readonly vb = SWISS_MAP_VIEWBOX;
  protected readonly ratio = `${SWISS_MAP_VIEWBOX.width}/${SWISS_MAP_VIEWBOX.height}`;

  /** Simplified national border, drawn to the same box `projectToSwissMap` maps into. */
  protected readonly outline =
    'M25,540 L95,455 L150,405 L200,340 L250,290 L285,235 L300,180 L330,120 L355,72 L400,85 ' +
    'L450,70 L520,60 L575,30 L610,45 L640,80 L680,95 L720,110 L770,125 L820,150 L855,185 ' +
    'L880,215 L900,250 L930,285 L950,320 L935,360 L900,395 L870,420 L850,450 L820,470 ' +
    'L790,490 L760,500 L730,520 L700,545 L680,585 L660,610 L640,590 L620,555 L600,530 ' +
    'L575,505 L540,495 L500,480 L460,478 L420,500 L390,560 L360,590 L340,570 L320,540 ' +
    'L295,520 L265,530 L230,545 L200,555 L170,545 L140,530 L110,540 L75,545 Z';

  /** Percent positions, so the pins stay put when the frame is resized. */
  protected placed = computed(() => this.pins().map((p) => {
    const { x, y } = projectToSwissMap(p.latitude, p.longitude);
    return { ...p, left: (x / this.vb.width) * 100, top: (y / this.vb.height) * 100 };
  }));
}

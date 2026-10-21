import {
  AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, computed, inject, input,
  effect, signal, viewChild
} from '@angular/core';
import * as L from 'leaflet';

/** One radar frame as offered by RainViewer. */
interface RadarFrame { time: number; path: string; }

/** Opacity of the visible radar layer; every other frame's layer sits at 0. */
const FRAME_OPACITY = 0.75;

/**
 * RainViewer's free tier serves radar tiles up to zoom 7 only (since 2026). Above that every
 * tile is a grey "Zoom Level Not Supported" image with HTTP 200 — no `tileerror`, just a map
 * full of grey boxes. `maxNativeZoom` makes Leaflet fetch zoom-7 tiles and scale them up.
 * The free tier also dropped the colour schemes (every scheme returns the same "Universal
 * Blue" picture) and the nowcast (`radar.nowcast` is empty), see the legend below.
 */
const RADAR_MAX_NATIVE_ZOOM = 7;

/** A single failed tile happens (edge of coverage, a hiccup); only a pattern is worth a notice. */
const TILE_ERROR_NOTICE_THRESHOLD = 3;

/**
 * RainViewer's free tier allows a burst of 300 tile requests and 500 per minute per IP (measured
 * 2026-10-21: `x-ratelimit-burst-limit: 300`, `x-ratelimit-limit: 500`, `retry-after: 10`). The
 * first play-through of ~13 frames, a re-centre and a reload or two hit it, and every tile over
 * the limit came back 429 and stayed missing. A rejected tile is now asked for again once,
 * after the advertised `retry-after`; only a tile that fails twice counts towards the notice.
 */
const TILE_RETRY_DELAY_MS = 10_000;

/**
 * The base map is drawn grey. OpenStreetMap's land is a light beige, and RainViewer paints the
 * weakest echoes beige and snow white — at 75 % opacity both vanished into the map, so light
 * rain and snowfall looked like "nothing". A greyscale, slightly darkened base keeps streets and
 * borders readable and leaves colour to the radar alone. Same tiles, same source: only a CSS
 * filter on the base layer's own pane (the radar layers live in Leaflet's default tile pane).
 */
const BASE_PANE = 'okrBase';
const BASE_FILTER = 'grayscale(1) brightness(0.9) contrast(0.95)';

/**
 * `rain_radar` — animated precipitation over Switzerland.
 *
 * NOTHING may import this file statically: it is created by hand from `weather-section.ts`
 * via `await import()`, which is what keeps Leaflet out of the eager bundle. It is also
 * deliberately absent from the `@okr/weather-ui` barrel — an `export *` there would be a
 * static edge from every consumer of that lib.
 *
 * Tiles come from RainViewer: ready-made XYZ frames covering roughly the last two hours (the
 * nowcast is gone from the free tier). MeteoSwiss CombiPrecip would be sharper but ships as ODIM HDF5 in
 * EPSG:2056, which needs a decode/reproject/tile pipeline of its own. Only the tile layer
 * would change; the timeline below stays as it is.
 */
@Component({
  selector: 'okr-weather-rain-radar',
  standalone: true,
  styles: [`
    :host { display: block; }
    .map { width: 100%; aspect-ratio: 1000 / 560; border-radius: 6px; overflow: hidden; background: #EEF2F5; }
    .bar {
      display: flex; align-items: stretch; gap: 12px; margin-top: 12px; padding: 8px 10px;
      border: 1px solid var(--ion-color-step-150, #e3e7ee); border-radius: 6px;
    }
    button.play {
      flex: none; width: 44px; height: 44px; border-radius: 22px; border: none; cursor: pointer;
      background: var(--ion-color-secondary, #014da2);
      display: flex; align-items: center; justify-content: center;
    }
    .track { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .rail { position: relative; height: 16px; margin-top: 6px; }
    .rail .base, .rail .past {
      position: absolute; top: 7px; height: 3px; border-radius: 2px;
    }
    .rail .base { left: 0; right: 0; background: var(--ion-color-step-150, #e3e7ee); }
    .rail .past { left: 0; background: var(--ion-color-secondary, #014da2); }
    .rail input {
      position: absolute; inset: 0; width: 100%; margin: 0; opacity: 0; cursor: pointer;
    }
    .rail .knob {
      position: absolute; top: 2px; width: 13px; height: 13px; border-radius: 7px;
      background: var(--ion-color-danger, #c5000f); transform: translateX(-50%); pointer-events: none;
      box-shadow: 0 0 0 3px var(--ion-card-background, #fff);
    }
    .scale { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 11px; color: var(--ion-color-medium, #5f5f5f); }
    .scale .ramp {
      width: 120px; height: 8px; border-radius: 4px;
      background: linear-gradient(90deg, #88ddee, #0099cc, #0077aa, #005588, #ffee00, #ffaa00, #ff4400, #c10000, #ffaaff);
    }
    .legend { display: flex; margin-top: 4px; font-size: 11px; color: var(--ion-color-medium, #5f5f5f); }
    .stamp { font-size: 13px; font-variant-numeric: tabular-nums; }
    .error { padding: 16px 0; font-size: 14px; color: var(--ion-color-medium, #5f5f5f); }
  `],
  template: `
    <div class="map" #mapHost></div>

    @if (frames().length) {
      <div class="bar">
        <button class="play" type="button" (click)="toggle()"
                [attr.aria-label]="playing() ? pauseLabel() : playLabel()">
          @if (playing()) {
            <svg viewBox="0 0 24 24" width="20" height="20"><g fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></g></svg>
          } @else {
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 4l13 8-13 8z" fill="#fff"/></svg>
          }
        </button>
        <div class="track">
          <div class="stamp">{{ stamp() }}</div>
          <div class="rail">
            <div class="base"></div>
            <div class="past" [style.width.%]="progress()"></div>
            <input type="range" min="0" [max]="frames().length - 1" [value]="index()"
                   (input)="scrub($event)" [attr.aria-label]="playLabel()" />
            <div class="knob" [style.left.%]="progress()"></div>
          </div>
          <div class="legend">
            <div [style.width.%]="pastShare()">{{ measuredLabel() }}</div>
            @if (pastShare() < 100) { <div>{{ forecastLabel() }}</div> }
          </div>
        </div>
      </div>
    } @else if (failed()) {
      <div class="error">{{ errorLabel() }}</div>
    }

    @if (legendLabel()) {
      <div class="scale"><div class="ramp"></div><span>{{ legendLabel() }}</span></div>
    }

    @if (tilesFailed()) {
      <div class="error">{{ degradedLabel() }}</div>
    }
  `
})
export class WeatherRainRadar implements AfterViewInit, OnDestroy {
  /** Map centre — the page's location, defaulting to the middle of Switzerland. */
  public latitude = input(46.8);
  public longitude = input(8.23);
  public zoom = input(8);
  public measuredLabel = input('');
  public forecastLabel = input('');
  public playLabel = input('');
  public pauseLabel = input('');
  public errorLabel = input('');
  public degradedLabel = input('');
  /** Words under the colour ramp, e.g. "leicht · mässig · stark". */
  public legendLabel = input('');

  private mapHost = viewChild.required<ElementRef<HTMLElement>>('mapHost');

  protected frames = signal<RadarFrame[]>([]);
  protected index = signal(0);
  protected playing = signal(false);
  protected failed = signal(false);
  /** At least one radar tile did not load (rate limit, gap in the archive). */
  protected tilesFailed = signal(false);
  /** How many frames are measurements rather than nowcast — drives the legend split. */
  private pastCount = signal(0);

  private map?: L.Map;
  /** One kept layer per frame path — see `showFrame`. Never removed while the map lives. */
  private layers = new Map<string, L.TileLayer>();
  private visible?: L.TileLayer;
  private timer?: ReturnType<typeof setInterval>;
  private host = '';
  private tileErrors = 0;
  private retryTimers = new Set<ReturnType<typeof setTimeout>>();

  protected progress = computed(() => {
    const n = this.frames().length;
    return n < 2 ? 0 : (this.index() / (n - 1)) * 100;
  });

  protected pastShare = computed(() => {
    const n = this.frames().length;
    return n ? (this.pastCount() / n) * 100 : 0;
  });

  protected stamp = computed(() => {
    const frame = this.frames()[this.index()];
    if (!frame) return '';
    const d = new Date(frame.time * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    // the location may arrive after the map was built (locations load asynchronously)
    effect(() => {
      const centre: L.LatLngTuple = [this.latitude(), this.longitude()];
      this.map?.setView(centre, this.map.getZoom());
    });
  }

  public async ngAfterViewInit(): Promise<void> {
    this.map = L.map(this.mapHost().nativeElement, { attributionControl: true })
      .setView([this.latitude(), this.longitude()], this.zoom());
    const basePane = this.map.createPane(BASE_PANE);
    basePane.style.zIndex = '150';   // below Leaflet's tilePane (200), where the radar frames go
    basePane.style.filter = BASE_FILTER;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, attribution: '© OpenStreetMap', pane: BASE_PANE
    }).addTo(this.map);
    await this.loadFrames();
  }

  public ngOnDestroy(): void {
    this.stop();
    this.retryTimers.forEach(clearTimeout);
    this.map?.remove();
  }

  /**
   * RainViewer publishes its frame list as a small JSON document. A failure here is not fatal:
   * the base map stays, the timeline disappears and the widget says so — the alternative is a
   * dead play button over an empty map.
   */
  private async loadFrames(): Promise<void> {
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (!res.ok) throw new Error(`radar index ${res.status}`);
      const data = await res.json() as {
        host: string; radar: { past: RadarFrame[]; nowcast: RadarFrame[] };
      };
      this.host = data.host;
      const past = data.radar?.past ?? [];
      const nowcast = data.radar?.nowcast ?? [];
      this.pastCount.set(past.length);
      this.frames.set([...past, ...nowcast]);
      // start on the newest measurement, not on the nowcast and not two hours ago
      this.index.set(Math.max(0, past.length - 1));
      this.showFrame();
    } catch {
      this.failed.set(true);
    }
  }

  /**
   * Shows the current frame by fading layers, never by creating them.
   *
   * A `L.TileLayer` fetches its tiles when it is added to the map, so building a fresh one on
   * every 500 ms step re-requested every visible tile of every frame on every pass — roughly a
   * dozen tiles times sixteen frames, which is what walked into RainViewer's rate limit and
   * came back as HTTP 429. Each frame now gets ONE layer, created on first display and kept
   * (this is what RainViewer's own demo does); stepping only moves opacity, so a tile is
   * fetched once and never again.
   *
   * Keeping ~16 layers alive is the deliberate cost. It also removes the flicker the old
   * `setTimeout(remove, 120)` was working around: nothing is ever detached mid-animation.
   */
  private showFrame(): void {
    const frame = this.frames()[this.index()];
    if (!this.map || !frame) return;

    let layer = this.layers.get(frame.path);
    if (!layer) {
      // colour scheme 2 ("Universal Blue") is the only one the free tier still renders
      layer = L.tileLayer(`${this.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        opacity: 0, maxNativeZoom: RADAR_MAX_NATIVE_ZOOM, attribution: 'Radar © RainViewer'
      });
      // A tile 429/404 is otherwise completely silent: the animation keeps running over a
      // half-drawn radar picture and nothing tells the viewer the image is incomplete.
      layer.on('tileerror', (event: L.TileErrorEvent) => this.retryTile(event.tile));
      layer.addTo(this.map);
      this.layers.set(frame.path, layer);
    }

    this.visible?.setOpacity(0);
    layer.setOpacity(FRAME_OPACITY);
    this.visible = layer;
  }

  /** One delayed second attempt per tile (see TILE_RETRY_DELAY_MS); Leaflet's own load handler stays bound. */
  private retryTile(tile: HTMLImageElement): void {
    if (tile.dataset['retried']) {
      if (++this.tileErrors >= TILE_ERROR_NOTICE_THRESHOLD) this.tilesFailed.set(true);
      return;
    }
    tile.dataset['retried'] = '1';
    const src = tile.src;
    const retry = setTimeout(() => {
      this.retryTimers.delete(retry);
      tile.src = `${src}${src.includes('?') ? '&' : '?'}retry=1`;
    }, TILE_RETRY_DELAY_MS);
    this.retryTimers.add(retry);
  }

  protected toggle(): void {
    if (this.playing()) { this.stop(); } else { this.start(); }
  }

  private start(): void {
    if (this.frames().length < 2) return;
    this.playing.set(true);
    this.timer = setInterval(() => {
      this.index.set((this.index() + 1) % this.frames().length);
      this.showFrame();
    }, 500);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.playing.set(false);
  }

  protected scrub(event: Event): void {
    this.stop();
    this.index.set(Number((event.target as HTMLInputElement).value));
    this.showFrame();
  }
}

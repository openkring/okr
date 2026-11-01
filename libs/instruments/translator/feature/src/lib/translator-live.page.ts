import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capgo/camera-preview';

import { ENV } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { LupeCamera, LupeCameraError, LupeError, NativeLupeCamera, WebLupeCamera } from '@okr/instruments-lupe-feature';
import { clampZoom, DIGITAL_ZOOM_RANGE, formatZoom, LUPE_I18N_KEYS, LupeI18n, stepZoom, ZoomRange } from '@okr/instruments-lupe-util';
import { ocrModels, pendingTexts, Rect, toView, visibleRect } from '@okr/instruments-translator-util';

import { LiveOcr } from './translator-ocr';
import { TranslatorStore } from './translator.store';

type LiveStatus = 'idle' | 'starting' | 'loading' | 'live' | 'error' | 'noModel' | 'modelFailed';

/** One overlay: the translation laid over the recognised paragraph, in view pixels. */
interface Overlay {
  text: string;
  box: Rect;
  fontPx: number;
}

/** Longest side of the image handed to the recogniser; larger frames cost time without reading better. */
const MAX_OCR_SIDE = 1280;
/** Pause between two recognitions, so the phone stays responsive and cool. */
const CYCLE_PAUSE_MS = 250;
/** Remembered translations per visit; enough for a menu card, small enough to never matter. */
const MEMO_LIMIT = 500;

/**
 * The Übersetzer's live view (idea 2.126 phase 2): the rear camera full screen with the Lupe's zoom
 * slider and no other buttons but «back». Text in view is recognised on the device (tesseract.js, one
 * frame at a time) and each paragraph is covered by its translation, placed over the original. Only
 * paragraphs not translated yet go to the `translateMany` op, never the image. Language pair and
 * flashlight come from the text view. The camera reuses the Lupe's backends (web and native preview).
 */
@Component({
  selector: 'okr-translator-live-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TranslatorStore],
  imports: [IonContent, IonButton, IonIcon, IonSpinner, SvgIconPipe],
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(document:pause)': 'onPause()',
    '(document:resume)': 'onResume()',
  },
  styles: [`
    ion-content { --background: #000; }
    ion-content.native { --background: transparent; }
    ion-content.native .stage { background: transparent; }
    .stage { position: absolute; inset: 0; overflow: hidden; background: #000; }
    video { width: 100%; height: 100%; object-fit: cover; transform-origin: center; display: block; }
    video.hidden { visibility: hidden; }
    .overlays { position: absolute; inset: 0; pointer-events: none; }
    .overlay {
      position: absolute; box-sizing: border-box; overflow: hidden; padding: 0 0.15em; border-radius: 0.2em;
      background: rgba(255, 255, 255, 0.92); color: #000; line-height: 1.1; overflow-wrap: anywhere;
      transition: top 0.2s, left 0.2s, width 0.2s, height 0.2s;
    }
    .close {
      position: absolute; z-index: 2; color: #fff; --background: rgba(0, 0, 0, 0.45); --border-radius: 50%;
      top: calc(env(safe-area-inset-top) + 0.5rem); left: calc(env(safe-area-inset-left) + 0.5rem);
    }
    .status {
      position: absolute; z-index: 2; left: 50%; transform: translateX(-50%); max-width: calc(100% - 6rem);
      top: calc(env(safe-area-inset-top) + 0.75rem); display: flex; align-items: center; gap: 0.5rem;
      padding: 0.35rem 0.75rem; border-radius: 1rem; background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 0.85rem;
    }
    .status ion-spinner { width: 1rem; height: 1rem; color: #fff; }
    .message {
      position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 1rem; padding: 2rem; color: #fff; text-align: center;
    }
    .panel {
      position: absolute; z-index: 2; display: flex; align-items: center; gap: 0.25rem;
      left: 0.75rem; right: 0.75rem; bottom: calc(env(safe-area-inset-bottom) + 0.75rem);
      max-width: 560px; margin: 0 auto; padding: 0.5rem 0.75rem; border-radius: 1.5rem;
      background: rgba(28, 28, 30, 0.92); color: #fff;
    }
    .panel ion-button { --color: #fff; margin: 0; }
    input[type=range] { flex: 1 1 auto; min-width: 0; accent-color: var(--ion-color-warning, #ffc409); }
    .value { flex: none; min-width: 3.5em; text-align: center; font-variant-numeric: tabular-nums; }
    @media (orientation: landscape) {
      .panel {
        flex-direction: column-reverse; left: auto; max-width: none; margin: 0;
        top: calc(env(safe-area-inset-top) + 0.75rem); bottom: calc(env(safe-area-inset-bottom) + 0.75rem);
        right: calc(env(safe-area-inset-right) + 0.75rem); padding: 0.75rem 0.5rem;
      }
      input[type=range] { writing-mode: vertical-lr; direction: rtl; width: auto; min-height: 0; }
    }
  `],
  template: `
    <ion-content [fullscreen]="true" [scrollY]="false" [class.native]="nativePreview() && cameraUp()">
      <div class="stage" #stage>
        @if (!nativePreview()) {
          <video #video autoplay playsinline muted [class.hidden]="!cameraUp()"
            [style.transform]="'scale(' + digitalScale() + ')'"></video>
        }
        <div class="overlays">
          @for (o of overlays(); track $index) {
            <div class="overlay" [attr.lang]="store.target()"
              [style.left.px]="o.box.x" [style.top.px]="o.box.y" [style.width.px]="o.box.w" [style.min-height.px]="o.box.h"
              [style.font-size.px]="o.fontPx">{{ o.text }}</div>
          }
        </div>
        <ion-button class="close" fill="solid" [title]="store.i18n.live_close()" (click)="close()">
          <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
        </ion-button>

        @switch (status()) {
          @case ('error') {
            <div class="message">
              <p>{{ cameraErrorText() }}</p>
              @if (error() !== 'unsupported') {
                <ion-button color="light" (click)="start()">{{ lupeI18n.retry() }}</ion-button>
              }
            </div>
          }
          @case ('noModel') {
            <div class="message"><p>{{ store.i18n.live_noModel() }}</p>
              <ion-button color="light" (click)="close()">{{ store.i18n.live_close() }}</ion-button></div>
          }
          @case ('modelFailed') {
            <div class="message"><p>{{ store.i18n.live_modelFailed() }}</p>
              <ion-button color="light" (click)="start()">{{ lupeI18n.retry() }}</ion-button></div>
          }
          @default {
            @if (status() === 'loading' || status() === 'starting') {
              <div class="status"><ion-spinner name="crescent" />{{ store.i18n.live_loading() }}</div>
            } @else if (translateError()) {
              <div class="status">{{ store.i18n.error_failed() }}</div>
            } @else if (overlays().length === 0) {
              <div class="status">{{ store.i18n.live_hint() }}</div>
            }
            <div class="panel">
              <ion-button fill="clear" [title]="lupeI18n.zoom_out()" [disabled]="zoom() <= range().min" (click)="step(-1)">
                <ion-icon slot="icon-only" src="{{ 'remove' | svgIcon }}" />
              </ion-button>
              <input type="range" [disabled]="range().max <= range().min" [min]="range().min" [max]="range().max" [step]="range().step" [value]="zoom()"
                [attr.aria-label]="lupeI18n.zoom()" [attr.aria-valuetext]="zoomLabel()" (input)="onSlider($event)" />
              <ion-button fill="clear" [title]="lupeI18n.zoom_in()" [disabled]="zoom() >= range().max" (click)="step(1)">
                <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
              </ion-button>
              <span class="value">{{ zoomLabel() }}</span>
            </div>
          }
        }
      </div>
    </ion-content>
  `,
})
export class TranslatorLivePage implements ViewDidEnter, ViewWillLeave {
  protected readonly store = inject(TranslatorStore);
  private readonly router = inject(Router);
  private readonly env = inject(ENV);
  protected readonly lupeI18n = inject(I18nService).translateAll(LUPE_I18N_KEYS) as LupeI18n;
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly stage = viewChild<ElementRef<HTMLDivElement>>('stage');

  protected readonly status = signal<LiveStatus>('idle');
  protected readonly error = signal<LupeError>('failed');
  protected readonly range = signal<ZoomRange>(DIGITAL_ZOOM_RANGE);
  protected readonly zoom = signal(1);
  protected readonly digitalZoom = signal(true);
  protected readonly overlays = signal<Overlay[]>([]);
  protected readonly translateError = signal(false);
  protected readonly nativePreview = signal(Capacitor.isNativePlatform());

  protected readonly cameraUp = computed(() => this.status() === 'live' || this.status() === 'loading');
  protected readonly digitalScale = computed(() => (this.digitalZoom() ? this.zoom() : 1));
  protected readonly zoomLabel = computed(() => formatZoom(this.zoom()));
  protected readonly cameraErrorText = computed(() => {
    const i18n = this.lupeI18n;
    const texts: Record<LupeError, () => string> = {
      denied: i18n.error_denied, noCamera: i18n.error_noCamera, unsupported: i18n.error_unsupported,
      failed: i18n.error_failed, unimplemented: i18n.error_failed,
    };
    return texts[this.error()]();
  });

  private readonly webCamera = new WebLupeCamera(() => this.video()?.nativeElement);
  private readonly nativeCamera = new NativeLupeCamera();
  private readonly ocr = new LiveOcr(this.env.services.imgixBaseUrl);
  private readonly canvas = document.createElement('canvas');
  /** recognised text → translation, for this visit and this language pair */
  private readonly memo = new Map<string, string>();
  private active = false;
  private running = false;
  /** Bumped on every start/stop; a loop or camera from an older generation shuts itself down. */
  private generation = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      void this.ocr.terminate();
    });
  }

  private get camera(): LupeCamera {
    return this.nativePreview() ? this.nativeCamera : this.webCamera;
  }

  public ionViewDidEnter(): void {
    this.active = true;
    void this.start();
  }

  public ionViewWillLeave(): void {
    this.active = false;
    this.stop();
  }

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') this.onPause();
    else this.onResume();
  }

  protected onPause(): void {
    this.stop();
  }

  protected onResume(): void {
    if (this.active && !this.running) void this.start();
  }

  protected close(): void {
    void this.router.navigateByUrl('/translator');
  }

  protected async start(): Promise<void> {
    this.stop();
    const generation = this.generation;
    const models = ocrModels(this.store.source(), this.store.i18nService.getActiveLang());
    if (!models) {
      this.status.set('noModel');
      return;
    }
    const camera = this.camera;
    this.status.set('starting');
    try {
      const info = await camera.start();
      if (generation !== this.generation || !this.active) {
        camera.stop();
        return;
      }
      this.running = true;
      this.range.set(info.range);
      this.digitalZoom.set(info.digital);
      this.zoom.set(clampZoom(this.zoom(), info.range));
      camera.setZoom(this.zoom());
      if (this.store.torch() && info.torch) void camera.setTorch(true);
    } catch (error) {
      if (generation !== this.generation) return;
      const kind = error instanceof LupeCameraError ? error.kind : 'failed';
      if (kind === 'unimplemented') {
        this.nativePreview.set(false);
        void this.start();
        return;
      }
      this.error.set(kind);
      this.status.set('error');
      return;
    }

    this.status.set('loading');
    try {
      await this.ocr.load(models);
    } catch {
      if (generation !== this.generation) return;
      this.stop();
      this.status.set('modelFailed');
      return;
    }
    if (generation !== this.generation) return;
    this.status.set('live');
    void this.loop(generation);
  }

  protected onSlider(event: Event): void {
    this.setZoom(Number((event.target as HTMLInputElement).value));
  }

  protected step(direction: 1 | -1): void {
    this.setZoom(stepZoom(this.zoom(), this.range(), direction));
  }

  private setZoom(value: number): void {
    this.zoom.set(clampZoom(value, this.range()));
    if (this.running) this.camera.setZoom(this.zoom());
  }

  /** Recognise → place overlays → translate what is new; one frame at a time until the generation changes. */
  private async loop(generation: number): Promise<void> {
    while (generation === this.generation) {
      const frame = await this.grabFrame().catch(() => null);
      if (generation !== this.generation) return;
      if (frame) {
        const blocks = await this.ocr.recognize(this.canvas).catch(() => []);
        if (generation !== this.generation) return;
        const { viewW, viewH } = frame;
        const crop = { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height };
        const placed = blocks.map(b => ({ text: b.text, lines: b.lines, box: toView(b.box, crop, viewW, viewH) }));
        this.show(placed);
        const fresh = pendingTexts(placed.map(p => p.text), new Set(this.memo.keys()));
        if (fresh.length > 0) {
          await this.translate(fresh);
          if (generation !== this.generation) return;
          this.show(placed);
        }
      }
      await new Promise(resolve => setTimeout(resolve, CYCLE_PAUSE_MS));
    }
  }

  private show(placed: { text: string; lines: number; box: Rect }[]): void {
    this.overlays.set(placed
      .filter(p => this.memo.has(p.text))
      .map(p => ({ text: this.memo.get(p.text) as string, box: p.box, fontPx: overlayFontPx(p.box.h, p.lines) })));
  }

  private async translate(texts: string[]): Promise<void> {
    try {
      const res = await this.store.translatorService.translateMany(texts, this.store.source(), this.store.target());
      if (this.memo.size + texts.length > MEMO_LIMIT) this.memo.clear();
      texts.forEach((t, i) => this.memo.set(t, res.translations[i] ?? t));
      this.translateError.set(false);
    } catch {
      this.translateError.set(true);
      // back off a little, so a quota or network problem is not hammered once per frame
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  /**
   * Draws the visible part of the current camera frame into `canvas`, at most MAX_OCR_SIDE wide or
   * high. Web: the `<video>` (digital zoom crops further). Native: a sample from the preview plugin.
   */
  private async grabFrame(): Promise<{ viewW: number; viewH: number } | null> {
    const stage = this.stage()?.nativeElement;
    if (!stage) return null;
    const viewW = stage.clientWidth;
    const viewH = stage.clientHeight;
    let source: CanvasImageSource;
    let srcW: number;
    let srcH: number;
    let zoom = 1;
    if (this.nativePreview()) {
      const sample = await CameraPreview.captureSample({ quality: 80 });
      const img = new Image();
      img.src = sample.value.startsWith('data:') ? sample.value : `data:image/jpeg;base64,${sample.value}`;
      await img.decode();
      source = img;
      srcW = img.naturalWidth;
      srcH = img.naturalHeight;
    } else {
      const video = this.video()?.nativeElement;
      if (!video || video.videoWidth === 0) return null;
      source = video;
      srcW = video.videoWidth;
      srcH = video.videoHeight;
      zoom = this.digitalScale();
    }
    const crop = visibleRect(srcW, srcH, viewW, viewH, zoom);
    if (crop.w <= 0 || crop.h <= 0) return null;
    const scale = Math.min(1, MAX_OCR_SIDE / Math.max(crop.w, crop.h));
    this.canvas.width = Math.round(crop.w * scale);
    this.canvas.height = Math.round(crop.h * scale);
    this.canvas.getContext('2d')?.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, this.canvas.width, this.canvas.height);
    return { viewW, viewH };
  }

  /** Stopping the camera also switches the flashlight off; the recogniser stays loaded for a quick resume. */
  private stop(): void {
    this.generation++;
    this.running = false;
    this.camera.stop();
    this.overlays.set([]);
    if (this.status() === 'live' || this.status() === 'loading' || this.status() === 'starting') this.status.set('idle');
  }
}

/** The original's line height, a little smaller so a longer translation still fits the box. */
function overlayFontPx(boxHeight: number, lines: number): number {
  return Math.max(10, Math.min(40, (boxHeight / lines) * 0.75));
}

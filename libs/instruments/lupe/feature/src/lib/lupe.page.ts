import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonMenuButton, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

import { SvgIconPipe } from '@okr/shared-pipes';
import { clampZoom, DIGITAL_ZOOM_RANGE, formatZoom, stepZoom, ZoomRange } from '@okr/instruments-lupe-util';

import { LupeCamera, LupeCameraError, LupeError, NativeLupeCamera, WebLupeCamera } from './lupe-camera';
import { LupeStore } from './lupe.store';

type LupeStatus = 'idle' | 'starting' | 'live' | 'error';

/**
 * The Lupe (idea 2.125): the rear camera fills the screen, one dark panel at the bottom carries the
 * flashlight toggle and the zoom slider; in landscape the panel moves to the right edge and the
 * slider turns vertical. In the native app the camera-preview plugin gives real lens zoom and the
 * flashlight on iOS and Android; in the browser hardware zoom and torch where the camera offers them
 * (Chrome on Android), digital zoom (CSS scale) and no flashlight otherwise (iOS Safari/PWA).
 * Nothing is recorded; the camera stops when the page is left or the app goes to the background.
 */
@Component({
  selector: 'okr-lupe-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LupeStore],
  imports: [IonContent, IonButton, IonIcon, IonMenuButton, SvgIconPipe],
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    // Capacitor fires `pause`/`resume` on the document when the native app goes to/returns from the background
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
    .menu {
      position: absolute; z-index: 2; color: #fff; background: rgba(0, 0, 0, 0.45); border-radius: 50%;
      top: calc(env(safe-area-inset-top) + 0.5rem); left: calc(env(safe-area-inset-left) + 0.5rem);
    }
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
    .torch { --border-radius: 50%; --padding-start: 0; --padding-end: 0; width: 3rem; height: 3rem; flex: none; }
    .torch.on { --background: #fff; --color: #000; --background-hover: #fff; }
    .torch ion-icon { font-size: 1.5rem; }
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
    <ion-content [fullscreen]="true" [scrollY]="false" [class.native]="nativePreview() && status() === 'live'">
      <div class="stage">
        @if (!nativePreview()) {
          <video #video autoplay playsinline muted [class.hidden]="status() !== 'live'"
            [style.transform]="'scale(' + digitalScale() + ')'"></video>
        }
        <ion-menu-button class="menu" />

        @if (status() === 'error') {
          <div class="message">
            <p>{{ errorText() }}</p>
            @if (error() !== 'unsupported') {
              <ion-button color="light" (click)="start()">{{ store.i18n.retry() }}</ion-button>
            }
          </div>
        } @else {
          <div class="panel">
            @if (torchAvailable()) {
              <ion-button class="torch" fill="clear" [class.on]="store.torch()" [attr.aria-pressed]="store.torch()"
                [title]="store.torch() ? store.i18n.torch_off() : store.i18n.torch_on()" (click)="toggleTorch()">
                <ion-icon slot="icon-only" src="{{ 'bulb' | svgIcon }}" />
              </ion-button>
            }
            <ion-button fill="clear" [title]="store.i18n.zoom_out()" [disabled]="store.zoom() <= range().min" (click)="step(-1)">
              <ion-icon slot="icon-only" src="{{ 'remove' | svgIcon }}" />
            </ion-button>
            <input type="range" [disabled]="range().max <= range().min" [min]="range().min" [max]="range().max" [step]="range().step" [value]="store.zoom()"
              [attr.aria-label]="store.i18n.zoom()" [attr.aria-valuetext]="zoomLabel()" (input)="onSlider($event)" />
            <ion-button fill="clear" [title]="store.i18n.zoom_in()" [disabled]="store.zoom() >= range().max" (click)="step(1)">
              <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
            </ion-button>
            <span class="value">{{ zoomLabel() }}</span>
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class LupePage implements ViewDidEnter, ViewWillLeave {
  protected readonly store = inject(LupeStore);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly status = signal<LupeStatus>('idle');
  protected readonly error = signal<LupeError>('failed');
  protected readonly range = signal<ZoomRange>(DIGITAL_ZOOM_RANGE);
  protected readonly digitalZoom = signal(true);
  protected readonly torchAvailable = signal(false);
  /** Native app with the camera-preview plugin; false in the browser and in app builds without it. */
  protected readonly nativePreview = signal(Capacitor.isNativePlatform());

  protected readonly digitalScale = computed(() => (this.digitalZoom() ? this.store.zoom() : 1));
  protected readonly zoomLabel = computed(() => formatZoom(this.store.zoom()));
  protected readonly errorText = computed(() => {
    const i18n = this.store.i18n;
    const texts: Record<LupeError, () => string> = {
      denied: i18n.error_denied, noCamera: i18n.error_noCamera, unsupported: i18n.error_unsupported,
      failed: i18n.error_failed, unimplemented: i18n.error_failed,
    };
    return texts[this.error()]();
  });

  private readonly webCamera = new WebLupeCamera(() => this.video()?.nativeElement);
  private readonly nativeCamera = new NativeLupeCamera();
  private active = false;
  private running = false;
  /** Bumped on every start/stop, so a camera that comes up after leaving is shut down again. */
  private generation = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
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

  protected async start(): Promise<void> {
    this.stop();
    const generation = this.generation;
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
      this.torchAvailable.set(info.torch);
      this.status.set('live');
    } catch (error) {
      if (generation !== this.generation) return;
      const kind = error instanceof LupeCameraError ? error.kind : 'failed';
      if (kind === 'unimplemented') {
        // app build without the plugin: the WebView's own camera still works, with fewer features
        this.nativePreview.set(false);
        void this.start();
        return;
      }
      this.fail(kind);
      return;
    }
    this.store.setZoom(clampZoom(this.store.zoom(), this.range()));
    camera.setZoom(this.store.zoom());
    if (this.store.torch() && this.torchAvailable()) void this.applyTorch(true);
  }

  protected onSlider(event: Event): void {
    this.setZoom(Number((event.target as HTMLInputElement).value));
  }

  protected step(direction: 1 | -1): void {
    this.setZoom(stepZoom(this.store.zoom(), this.range(), direction));
  }

  protected toggleTorch(): void {
    const torch = !this.store.torch();
    this.store.setTorch(torch);
    void this.applyTorch(torch);
  }

  private setZoom(value: number): void {
    this.store.setZoom(clampZoom(value, this.range()));
    if (this.running) this.camera.setZoom(this.store.zoom());
  }

  private async applyTorch(on: boolean): Promise<void> {
    if (!this.running) return;
    if (!(await this.camera.setTorch(on))) this.torchAvailable.set(false);
  }

  /** Stopping the camera also switches the flashlight off; the stored torch setting stays for next time. */
  private stop(): void {
    this.generation++;
    this.running = false;
    this.camera.stop();
    if (this.status() !== 'error') this.status.set('idle');
  }

  private fail(error: LupeError): void {
    this.error.set(error);
    this.status.set('error');
  }
}

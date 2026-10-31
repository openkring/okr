import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonMenuButton, ViewDidEnter, ViewWillLeave } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import {
  CameraCapabilities, clampZoom, DIGITAL_ZOOM_RANGE, formatZoom, hardwareZoomRange, hasTorch, ImageCaptureConstraintSet, stepZoom, ZoomRange,
} from '@okr/instruments-lupe-util';

import { LupeStore } from './lupe.store';

type LupeError = 'denied' | 'noCamera' | 'unsupported' | 'failed';
type LupeStatus = 'idle' | 'starting' | 'live' | 'error';

function errorKindOf(error: unknown): LupeError {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noCamera';
  return 'failed';
}

/**
 * The Lupe (idea 2.125): the rear camera fills the screen, one dark panel at the bottom carries the
 * flashlight toggle and the zoom slider; in landscape the panel moves to the right edge and the
 * slider turns vertical. Hardware zoom and torch where the camera offers them (Chrome on Android),
 * digital zoom (CSS scale) and no flashlight otherwise (iOS Safari/PWA). Nothing is recorded; the
 * stream stops when the page is left or the app goes to the background.
 */
@Component({
  selector: 'okr-lupe-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LupeStore],
  imports: [IonContent, IonButton, IonIcon, IonMenuButton, SvgIconPipe],
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
  styles: [`
    ion-content { --background: #000; }
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
    <ion-content [fullscreen]="true" [scrollY]="false">
      <div class="stage">
        <video #video autoplay playsinline muted [class.hidden]="status() !== 'live'"
          [style.transform]="'scale(' + digitalScale() + ')'"></video>
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
            <input type="range" [min]="range().min" [max]="range().max" [step]="range().step" [value]="store.zoom()"
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
  protected readonly hardwareZoom = signal(false);
  protected readonly torchAvailable = signal(false);

  protected readonly digitalScale = computed(() => (this.hardwareZoom() ? 1 : this.store.zoom()));
  protected readonly zoomLabel = computed(() => formatZoom(this.store.zoom()));
  protected readonly errorText = computed(() => {
    const i18n = this.store.i18n;
    const texts: Record<LupeError, () => string> = {
      denied: i18n.error_denied, noCamera: i18n.error_noCamera, unsupported: i18n.error_unsupported, failed: i18n.error_failed,
    };
    return texts[this.error()]();
  });

  private active = false;
  private stream: MediaStream | undefined;
  private track: MediaStreamTrack | undefined;
  /** Bumped on every start/stop, so a getUserMedia that resolves after leaving is discarded. */
  private generation = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
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
    if (document.visibilityState === 'hidden') this.stop();
    else if (this.active && !this.stream) void this.start();
  }

  protected async start(): Promise<void> {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail('unsupported');
      return;
    }
    const generation = this.generation;
    this.status.set('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // `zoom: true` asks Chrome to expose the zoom capability; browsers that do not know it ignore it
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, zoom: true } as ImageCaptureConstraintSet,
        audio: false,
      });
    } catch (error) {
      if (generation === this.generation) this.fail(errorKindOf(error));
      return;
    }
    if (generation !== this.generation || !this.active) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    const video = this.video()?.nativeElement;
    if (!video) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    this.stream = stream;
    this.track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    await video.play().catch(() => undefined);

    const capabilities = (this.track?.getCapabilities?.() ?? {}) as CameraCapabilities;
    const hardware = hardwareZoomRange(capabilities);
    this.range.set(hardware ?? DIGITAL_ZOOM_RANGE);
    this.hardwareZoom.set(!!hardware);
    this.torchAvailable.set(hasTorch(capabilities));
    this.status.set('live');

    this.store.setZoom(clampZoom(this.store.zoom(), this.range()));
    this.applyZoom();
    if (this.store.torch() && this.torchAvailable()) this.applyTorch(true);
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
    this.applyTorch(torch);
  }

  private setZoom(value: number): void {
    this.store.setZoom(clampZoom(value, this.range()));
    this.applyZoom();
  }

  /** Hardware zoom goes to the track; digital zoom is the `digitalScale` CSS transform. */
  private applyZoom(): void {
    if (!this.hardwareZoom() || !this.track) return;
    const zoom: ImageCaptureConstraintSet = { zoom: this.store.zoom() };
    this.track.applyConstraints({ advanced: [zoom] }).catch(() => undefined);
  }

  private applyTorch(torch: boolean): void {
    if (!this.track) return;
    const constraint: ImageCaptureConstraintSet = { torch };
    this.track.applyConstraints({ advanced: [constraint] }).catch(() => this.torchAvailable.set(false));
  }

  /** Stopping the track also switches the flashlight off; the stored torch setting stays for next time. */
  private stop(): void {
    this.generation++;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
    this.track = undefined;
    const video = this.video()?.nativeElement;
    if (video) video.srcObject = null;
    if (this.status() !== 'error') this.status.set('idle');
  }

  private fail(error: LupeError): void {
    this.error.set(error);
    this.status.set('error');
  }
}

import { CameraPreview } from '@capgo/camera-preview';

import {
  CameraCapabilities, DIGITAL_ZOOM_RANGE, hardwareZoomRange, hasTorch, ImageCaptureConstraintSet, nativeZoomRange, ZoomRange,
} from '@okr/instruments-lupe-util';

export type LupeError = 'denied' | 'noCamera' | 'unsupported' | 'failed' | 'unimplemented';

export class LupeCameraError extends Error {
  constructor(public readonly kind: LupeError) {
    super(kind);
  }
}

/** What a started camera offers. `digital` = the page zooms with a CSS scale on the `<video>`. */
export interface LupeCameraInfo {
  range: ZoomRange;
  digital: boolean;
  torch: boolean;
}

/** One camera backend; `start` rejects with a `LupeCameraError`. */
export interface LupeCamera {
  start(): Promise<LupeCameraInfo>;
  setZoom(level: number): void;
  /** Resolves `false` when the camera refused the flashlight. */
  setTorch(on: boolean): Promise<boolean>;
  stop(): void;
}

function webErrorKind(error: unknown): LupeError {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noCamera';
  return 'failed';
}

/**
 * Browser/PWA: `getUserMedia` into the page's `<video>`. Hardware zoom and torch through
 * `applyConstraints` where the camera reports them (Chrome on Android), digital zoom otherwise.
 */
export class WebLupeCamera implements LupeCamera {
  private stream: MediaStream | undefined;
  private track: MediaStreamTrack | undefined;
  private hardware = false;

  constructor(private readonly video: () => HTMLVideoElement | undefined) {}

  public async start(): Promise<LupeCameraInfo> {
    if (!navigator.mediaDevices?.getUserMedia) throw new LupeCameraError('unsupported');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // `zoom: true` asks Chrome to expose the zoom capability; browsers that do not know it ignore it
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, zoom: true } as ImageCaptureConstraintSet,
        audio: false,
      });
    } catch (error) {
      throw new LupeCameraError(webErrorKind(error));
    }
    const video = this.video();
    if (!video) {
      stream.getTracks().forEach(t => t.stop());
      throw new LupeCameraError('failed');
    }
    this.stream = stream;
    this.track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    await video.play().catch(() => undefined);

    const capabilities = (this.track?.getCapabilities?.() ?? {}) as CameraCapabilities;
    const hardware = hardwareZoomRange(capabilities);
    this.hardware = !!hardware;
    return { range: hardware ?? DIGITAL_ZOOM_RANGE, digital: !hardware, torch: hasTorch(capabilities) };
  }

  public setZoom(level: number): void {
    if (!this.hardware || !this.track) return;
    const zoom: ImageCaptureConstraintSet = { zoom: level };
    this.track.applyConstraints({ advanced: [zoom] }).catch(() => undefined);
  }

  public async setTorch(on: boolean): Promise<boolean> {
    if (!this.track) return false;
    const torch: ImageCaptureConstraintSet = { torch: on };
    return this.track.applyConstraints({ advanced: [torch] }).then(() => true, () => false);
  }

  /** Stopping the track also switches the flashlight off. */
  public stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
    this.track = undefined;
    const video = this.video();
    if (video) video.srcObject = null;
  }
}

/** The whole Ionic background chain goes transparent while the native preview runs behind the WebView. */
function setWebViewTransparent(on: boolean): void {
  for (const el of [document.documentElement, document.body]) {
    if (on) {
      el.style.setProperty('--ion-background-color', 'transparent');
      el.style.setProperty('background', 'transparent');
    } else {
      el.style.removeProperty('--ion-background-color');
      el.style.removeProperty('background');
    }
  }
}

/**
 * Native app (iOS/Android): `@capgo/camera-preview` renders the rear camera behind the WebView
 * (`toBack`), so the page's panel floats over it. Real lens zoom and flashlight on both platforms;
 * the plugin re-lays the preview out on rotation itself. Rejects with `unimplemented` when the
 * installed app build does not contain the plugin yet — the page then falls back to the web camera.
 */
export class NativeLupeCamera implements LupeCamera {
  /** The preview is up (the plugin's `start` resolved and no `stop` since). */
  private running = false;
  /** Cleared by `stop()`; a `start` still awaiting the plugin then tears its preview down itself. */
  private wanted = false;
  /** A start waits for the previous stop, so a late plugin `stop` cannot kill the new preview. */
  private stopping: Promise<void> = Promise.resolve();

  public async start(): Promise<LupeCameraInfo> {
    this.wanted = true;
    await this.stopping;
    let granted: boolean;
    try {
      granted = (await CameraPreview.requestPermissions({ disableAudio: true })).camera === 'granted';
    } catch (error) {
      throw new LupeCameraError((error as { code?: string } | null)?.code === 'UNIMPLEMENTED' ? 'unimplemented' : 'failed');
    }
    if (!granted) throw new LupeCameraError('denied');
    if (!this.wanted) throw new LupeCameraError('failed');
    setWebViewTransparent(true);
    try {
      await CameraPreview.start({ position: 'rear', toBack: true, aspectMode: 'cover', disableAudio: true });
    } catch {
      setWebViewTransparent(false);
      throw new LupeCameraError('failed');
    }
    this.running = true;
    if (!this.wanted) {
      this.stop();
      throw new LupeCameraError('failed');
    }
    const zoom = await CameraPreview.getZoom().catch(() => undefined);
    const flashModes = await CameraPreview.getSupportedFlashModes().catch(() => ({ result: [] as string[] }));
    return {
      range: nativeZoomRange(zoom?.min, zoom?.max) ?? { min: 1, max: 1, step: 0.1 },
      digital: false,
      torch: flashModes.result.includes('torch'),
    };
  }

  public setZoom(level: number): void {
    CameraPreview.setZoom({ level }).catch(() => undefined);
  }

  public async setTorch(on: boolean): Promise<boolean> {
    return CameraPreview.setFlashMode({ flashMode: on ? 'torch' : 'off' }).then(() => true, () => false);
  }

  /** Stopping the preview also switches the flashlight off. */
  public stop(): void {
    this.wanted = false;
    setWebViewTransparent(false);
    if (!this.running) return;
    this.running = false;
    this.stopping = CameraPreview.stop().catch(() => undefined);
  }
}

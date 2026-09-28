import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';

import {
  HQ_AUDIO_ACCEPT,
  HQ_MAX_AUDIO_BYTES,
  HQ_MAX_AUDIO_SECONDS,
  HearingQuizI18n,
  audioExtension,
  isAcceptedAudioType,
  pickRecorderMimeType,
} from '@okr/games-hearing-quiz-util';

/**
 * The clip of a question: plays the current one, records a new one in the browser, or takes a file.
 * Emits the chosen `File`; uploading it is the parent's job (this is a ui component).
 *
 * The recorder prefers `audio/mp4` (see `HQ_RECORDER_MIME_TYPES`) and stops by itself at
 * `HQ_MAX_AUDIO_SECONDS`, so a recording can never exceed the limit an upload is checked against.
 */
@Component({
  selector: 'okr-hearing-quiz-audio-input',
  standalone: true,
  imports: [SvgIconPipe, IonItem, IonLabel, IonButton, IonIcon, IonNote],
  styles: [`
    .hq-audio { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 4px 0 8px; }
    audio { max-width: 100%; }
    .hq-rec { font-variant-numeric: tabular-nums; color: var(--ion-color-danger); }
    input[type=file] { display: none; }
  `],
  template: `
    <ion-item lines="none">
      <ion-label position="stacked">{{ i18n().audio_label() }}</ion-label>
      <div class="hq-audio">
        @if (audioUrl()) {
          <audio [src]="audioUrl()" controls preload="none"></audio>
        } @else {
          <ion-note>{{ i18n().audio_none() }}</ion-note>
        }
      </div>
    </ion-item>
    @if (!readOnly()) {
      <ion-item lines="none">
        <div class="hq-audio">
          @if (isRecording()) {
            <ion-button color="danger" (click)="stopRecording()">
              <ion-icon slot="start" src="{{ 'stop-circle' | svgIcon }}" />
              {{ i18n().audio_stop() }}
            </ion-button>
            <span class="hq-rec" aria-live="polite">● {{ recordingLabel() }}</span>
          } @else {
            <ion-button fill="outline" [disabled]="busy()" (click)="startRecording()">
              <ion-icon slot="start" src="{{ 'mic' | svgIcon }}" />
              {{ i18n().audio_record() }}
            </ion-button>
            <ion-button fill="outline" [disabled]="busy()" (click)="fileInput.click()">
              <ion-icon slot="start" src="{{ 'upload' | svgIcon }}" />
              {{ i18n().audio_upload() }}
            </ion-button>
            <input #fileInput type="file" [accept]="accept" (change)="onFileChosen($event)" />
          }
        </div>
      </ion-item>
      @if (problem()) {
        <ion-item lines="none"><ion-note color="danger">{{ problem() }}</ion-note></ion-item>
      }
    }
  `,
})
export class HearingQuizAudioInput {
  private readonly destroyRef = inject(DestroyRef);

  public readonly i18n = input.required<HearingQuizI18n>();
  public readonly audioUrl = input('');
  public readonly readOnly = input(true);
  /** true while the parent uploads the last emitted file */
  public readonly busy = input(false);

  public readonly fileSelected = output<File>();

  protected readonly accept = HQ_AUDIO_ACCEPT;
  protected readonly isRecording = signal(false);
  protected readonly seconds = signal(0);
  protected readonly problem = signal('');
  protected readonly recordingLabel = computed(() => {
    const s = this.seconds();
    return `0:${String(s).padStart(2, '0')} / 0:${HQ_MAX_AUDIO_SECONDS}`;
  });

  private recorder: MediaRecorder | undefined;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => this.cancel());
  }

  protected async startRecording(): Promise<void> {
    this.problem.set('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.problem.set(this.i18n().audio_mic_denied());
      return;
    }
    const mimeType = pickRecorderMimeType(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
    this.chunks = [];
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.recorder = recorder;
    recorder.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) this.chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      this.stopTimer();
      this.isRecording.set(false);
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(this.chunks, { type });
      this.chunks = [];
      if (blob.size === 0) return;
      this.emitChecked(new File([blob], `recording.${audioExtension(type)}`, { type }));
    };
    recorder.start(250);
    this.isRecording.set(true);
    this.seconds.set(0);
    this.timer = setInterval(() => {
      this.seconds.update(s => s + 1);
      if (this.seconds() >= HQ_MAX_AUDIO_SECONDS) this.stopRecording();
    }, 1000);
  }

  protected stopRecording(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
  }

  protected async onFileChosen(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = ''; // the same file may be chosen again after a fix
    if (!file) return;
    this.problem.set('');
    if (!isAcceptedAudioType(file.type)) {
      this.problem.set(this.i18n().audio_unsupported());
      return;
    }
    const duration = await this.durationOf(file);
    if (duration > HQ_MAX_AUDIO_SECONDS + 0.5) {
      this.problem.set(this.i18n().audio_too_long());
      return;
    }
    this.emitChecked(file);
  }

  private emitChecked(file: File): void {
    if (file.size > HQ_MAX_AUDIO_BYTES) {
      this.problem.set(this.i18n().audio_too_large());
      return;
    }
    this.fileSelected.emit(file);
  }

  /** Duration in seconds, or 0 when the browser cannot tell (then only the size limit applies). */
  private durationOf(file: File): Promise<number> {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const done = (value: number) => { URL.revokeObjectURL(url); resolve(Number.isFinite(value) ? value : 0); };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => done(audio.duration);
      audio.onerror = () => done(0);
      audio.src = url;
    });
  }

  private stopTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  private cancel(): void {
    this.stopTimer();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = () => this.recorder?.stream.getTracks().forEach(t => t.stop());
      this.recorder.stop();
    }
  }
}

import { Component, OnInit, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { getDownloadURL, ref } from 'firebase/storage';
import { captureException } from '@sentry/angular';

import { STORAGE } from '@okr/shared-config';
import { downloadToBrowser } from '@okr/shared-util-angular';

/**
 * Full-screen playback of one album video.
 *
 * A plain <video>, not okr-video: the ix-player is the HLS player for the StreamingVideo path,
 * while the transcoding function hands us a finished H.264 mp4 that every browser plays natively.
 *
 * The source is the Firebase download URL of the mp4 RENDERING — Firebase answers range requests
 * reliably, which is what makes seeking work. The download button hands over the ORIGINAL.
 */
@Component({
  selector: 'okr-video-view-modal',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonSpinner],
  styles: [`
    ion-content { --background: #000; }
    .player { display: flex; align-items: center; justify-content: center; min-height: 100%; }
    video { width: 100%; max-width: 1200px; max-height: 85dvh; background: #000; }
    .player-error { max-width: 32rem; padding: 1rem; color: #fff; text-align: center; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="download()">{{ downloadLabel() }}</ion-button>
          <ion-button (click)="close()">{{ closeLabel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="player">
        @if (playUrl(); as src) {
          <video [src]="src" controls autoplay playsinline></video>
        } @else if (loadError()) {
          <p class="player-error">{{ errorLabel() }}</p>
        } @else {
          <ion-spinner name="dots" />
        }
      </div>
    </ion-content>
  `
})
export class VideoViewModal implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly storage = inject(STORAGE);

  // inputs (passed as componentProps)
  public storagePath = input.required<string>();   // fullPath of the mp4 rendering
  public actionUrl = input('');                    // download URL of the original
  public title = input('');
  public downloadLabel = input('');
  public closeLabel = input('');
  public errorLabel = input('');

  protected readonly playUrl = signal<string | undefined>(undefined);
  /** Set when the download URL could not be resolved — the spinner must not be the final state. */
  protected readonly loadError = signal(false);

  /**
   * Resolve the download URL of the mp4 rendering.
   *
   * The failure has to be caught here. `playUrl` staying undefined is the SPINNER state, so an
   * unhandled rejection left the modal spinning forever: the member is told nothing, waits, and
   * closes it — and because nothing is thrown into Angular's error handler either, no ticket is
   * ever filed. Both halves of that are fixed: a message where the player would be, and an
   * explicit Sentry report, since a console line reaches nobody (no app installs
   * captureConsoleIntegration).
   *
   * The storage path IS attached: it is a derived rendering under the album prefix, not member
   * content, and without it the report cannot be told apart from any other failed video.
   */
  public async ngOnInit(): Promise<void> {
    try {
      this.playUrl.set(await getDownloadURL(ref(this.storage, this.storagePath())));
    } catch (ex) {
      this.loadError.set(true);
      captureException(ex, {
        tags: { albumVideo: 'download-url-failed' },
        extra: { storagePath: this.storagePath() },
      });
    }
  }

  protected async download(): Promise<void> {
    if (this.actionUrl()) await downloadToBrowser(this.actionUrl());
  }

  protected close(): void {
    this.modalController.dismiss();
  }
}

import { Component, OnInit, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { getDownloadURL, ref } from 'firebase/storage';

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

  protected readonly playUrl = signal<string | undefined>(undefined);

  public async ngOnInit(): Promise<void> {
    this.playUrl.set(await getDownloadURL(ref(this.storage, this.storagePath())));
  }

  protected async download(): Promise<void> {
    if (this.actionUrl()) await downloadToBrowser(this.actionUrl());
  }

  protected close(): void {
    this.modalController.dismiss();
  }
}

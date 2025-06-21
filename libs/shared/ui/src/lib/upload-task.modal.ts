import { Component, inject, signal, OnInit, input } from '@angular/core';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { IonCol, IonContent, IonGrid, IonLabel, IonProgressBar, IonRow, ModalController } from '@ionic/angular/standalone';
import { UploadTask, UploadTaskSnapshot, getDownloadURL } from 'firebase/storage';

import { TranslatePipe} from '@bk2/shared/i18n';
import { uploadToFirebaseStorage } from '@bk2/shared/config';
import { die, error } from '@bk2/shared/util';
import { HeaderComponent } from './header.component';

@Component({
  selector: 'bk-upload-task',
  imports: [
    AsyncPipe, DecimalPipe, TranslatePipe,
    HeaderComponent,
    IonContent, IonGrid, IonRow, IonCol, IonLabel, IonProgressBar
  ],
  styles: [`
    progress::-webkit-progress-value { transition: width 0.1s ease; }
  `],
  template: `
    <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-grid>
        @if(percentage(); as pct) {
          <ion-row>
            <ion-col>
              <ion-progress-bar [value]="pct/100" color="primary"></ion-progress-bar>
              <ion-label>{{ pct | number }}%</ion-label>
            </ion-col>
          </ion-row>
        }
        @if(snapshot(); as snap) {
          <ion-row>
            <ion-col>
              <ion-label>{{ snap.bytesTransferred }} of {{ snap.totalBytes }}, {{ snap.state }}</ion-label>
            </ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `
})
export class UploadTaskComponent implements OnInit {
  private readonly modalController = inject(ModalController);

  public file = input.required<File>();
  public fullPath = input.required<string>();
  public title = input('Upload');

  public task: UploadTask | undefined;
  public percentage = signal(0);
  public snapshot = signal<UploadTaskSnapshot | undefined>(undefined);

  ngOnInit() {
    this.task = uploadToFirebaseStorage(this.fullPath(), this.file());

    this.task.on('state_changed', (_snapshot) => {
      this.snapshot.set(_snapshot);
      // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
      this.percentage.set((_snapshot.bytesTransferred / _snapshot.totalBytes) * 100);
    }, 
    (_error) => {           // Handle unsuccessful uploads
      error(undefined, 'UploadTask.start: ERROR: ' + JSON.stringify(_error));
      this.modalController.dismiss(undefined, 'cancel');
    }, 
    async () => {           // Handle successful uploads on complete; i.e. save the download URL in the avatar collection
      if (!this.task) die('UploadTask.start: ERROR: upload task is undefined');
      const _downloadUrl = await getDownloadURL(this.task.snapshot.ref);
      this.modalController.dismiss(_downloadUrl, 'confirm');
    });
  }
}

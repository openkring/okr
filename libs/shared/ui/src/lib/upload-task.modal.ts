import { DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import {
  IonContent, IonIcon, IonItem, IonLabel, IonList, IonProgressBar, ModalController
} from '@ionic/angular/standalone';
import { UploadTask, getDownloadURL } from 'firebase/storage';

import { captureMessage } from '@sentry/angular';

import { uploadToFirebaseStorage } from '@okr/shared-config';
import { dismissOverlay } from '@okr/shared-util-angular';
import { describeUploadError } from '@okr/shared-util-core';

import { Header } from './header';
import { SvgIconPipe } from '@okr/shared-pipes';

export interface UploadEntry {
  file: File;
  fullPath: string;
}

interface UploadState {
  name: string;
  size: number;
  percentage: number;
  bytesTransferred: number;
  totalBytes: number;
  state: 'running' | 'paused' | 'success' | 'error' | 'pending';
  task?: UploadTask;
  downloadUrl?: string;
}

@Component({
  selector: 'okr-upload-task-modal',
  standalone: true,
  imports: [
    DecimalPipe, SvgIconPipe,
    Header,
    IonContent, IonList, IonItem, IonLabel, IonProgressBar, IonIcon,
  ],
  styles: [`
    ion-list { padding: 8px 0; }
    ion-item { --padding-start: 16px; --padding-end: 16px; --inner-padding-end: 0; }
    .file-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .file-name { font-weight: 500; font-size: 0.95rem; max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file-size { font-size: 0.8rem; color: var(--ion-color-medium); }
    .progress-row { display: flex; align-items: center; gap: 8px; }
    ion-progress-bar { flex: 1; height: 6px; border-radius: 3px; }
    .pct-label { font-size: 0.8rem; color: var(--ion-color-medium); width: 38px; text-align: right; }
    .status-icon { font-size: 1.4rem; }
    .status-success { color: var(--ion-color-success); }
    .status-error { color: var(--ion-color-danger); }
  `],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content>
      <ion-list lines="none">
        @for(item of uploadStates(); track item.name + $index) {
          <ion-item>
            <ion-label>
              <div class="file-info">
                <span class="file-name">{{ item.name }}</span>
                <span class="file-size">{{ formatBytes(item.size) }}</span>
              </div>
              @if(item.state === 'pending') {
                <div class="progress-row">
                  <ion-progress-bar value="0" color="medium" />
                  <span class="pct-label">—</span>
                </div>
              } @else if(item.state === 'running' || item.state === 'paused') {
                <div class="progress-row">
                  <ion-progress-bar [value]="item.percentage / 100" color="primary" />
                  <span class="pct-label">{{ item.percentage | number:'1.0-0' }}%</span>
                </div>
              } @else if(item.state === 'success') {
                <div class="progress-row">
                  <ion-progress-bar value="1" color="success" />
                  <ion-icon class="status-icon status-success" slot="end" src="{{'checkbox-circle' | svgIcon }}" />
                </div>
              } @else {
                <div class="progress-row">
                  <ion-progress-bar value="0" color="danger" />
                  <ion-icon class="status-icon status-error" slot="end" src="{{'cancel' | svgIcon }}" />
                </div>
              }
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `
})
export class UploadTaskModal implements OnInit {
  private readonly modalController = inject(ModalController);

  // inputs
  public uploads = input.required<UploadEntry[]>();
  public title = input('Upload');

  // state
  public uploadStates = signal<UploadState[]>([]);

  ngOnInit() {
    this.uploadStates.set(
      this.uploads().map(u => ({
        name: u.file.name,
        size: u.file.size,
        percentage: 0,
        bytesTransferred: 0,
        totalBytes: u.file.size,
        state: 'pending' as const,
      }))
    );

    const downloadUrls: (string | undefined)[] = new Array(this.uploads().length).fill(undefined);
    let completedCount = 0;

    this.uploads().forEach((entry, index) => {
      const task = uploadToFirebaseStorage(entry.fullPath, entry.file);

      this.uploadStates.update(states => {
        const updated = [...states];
        updated[index] = { ...updated[index], task, state: 'running' };
        return updated;
      });

      task.on(
        'state_changed',
        (snapshot) => {
          this.uploadStates.update(states => {
            const updated = [...states];
            updated[index] = {
              ...updated[index],
              percentage: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              state: snapshot.state as UploadState['state'],
            };
            return updated;
          });
        },
        (ex) => {
          this.report('upload', entry, ex);
          this.uploadStates.update(states => {
            const updated = [...states];
            updated[index] = { ...updated[index], state: 'error' };
            return updated;
          });
          completedCount++;
          if (completedCount === this.uploads().length) {
            dismissOverlay(this.modalController, downloadUrls, 'confirm');
          }
        },
        () => {
          // task.on() does not await this callback: an uncaught rejection here would surface as an
          // unhandled rejection AND leave completedCount short, so the modal would never dismiss.
          getDownloadURL(task.snapshot.ref)
            .then((url) => {
              downloadUrls[index] = url;
              this.uploadStates.update(states => {
                const updated = [...states];
                updated[index] = { ...updated[index], state: 'success', downloadUrl: url };
                return updated;
              });
            })
            .catch((ex) => {
              this.report('getDownloadURL', entry, ex);
              this.uploadStates.update(states => {
                const updated = [...states];
                updated[index] = { ...updated[index], state: 'error' };
                return updated;
              });
            })
            .finally(() => {
              completedCount++;
              if (completedCount === this.uploads().length) {
                dismissOverlay(this.modalController, downloadUrls, 'confirm');
              }
            });
        }
      );
    });
  }

  /**
   * Report a failed upload to Sentry.
   *
   * Until now BOTH failure paths called `error(undefined, ...)`, and `error()` with no
   * ToastController and the default `isDebugMode = false` does literally nothing — no console
   * line, no toast, no Sentry event (see `alert.util.ts`). The message it did not print was
   * `JSON.stringify(ex)`, which on a `FirebaseError` is `{}` anyway. A failed upload was
   * therefore invisible end to end: the modal flashed a red bar, dismissed, `addFiles` saw
   * `!downloadUrl` and silently skipped the file. That is why an iPhone user could report
   * "I cannot upload photos" and there was nothing whatsoever to look at.
   *
   * `captureMessage`, not `captureException`: an upload that fails on a rules denial or a dead
   * mobile connection is a normal outcome of a hostile network, not a crash — and the SDK's
   * error object carries no useful stack (it is constructed, not thrown from our code).
   */
  private report(stage: 'upload' | 'getDownloadURL', entry: UploadEntry, ex: unknown): void {
    const { code, message } = describeUploadError(ex);
    captureMessage(`Upload failed (${stage}): ${code}`, {
      level: 'error',
      tags: { uploadStage: stage, uploadErrorCode: code },
      extra: {
        fullPath: entry.fullPath,
        fileName: entry.file.name,
        fileSize: entry.file.size,
        fileType: entry.file.type || '(empty)',
        message,
      },
    });
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

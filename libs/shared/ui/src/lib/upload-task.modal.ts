import { DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import {
  IonContent, IonIcon, IonItem, IonLabel, IonList, IonProgressBar, ModalController
} from '@ionic/angular/standalone';
import { UploadTask, getDownloadURL } from 'firebase/storage';

import { captureMessage } from '@sentry/angular';

import { StorageBucket, attestAppCheck, uploadToFirebaseStorage } from '@okr/shared-config';
import { dismissOverlay } from '@okr/shared-util-angular';
import { describeUploadError, isRetryableUploadError } from '@okr/shared-util-core';

import { Header } from './header';
import { SvgIconPipe } from '@okr/shared-pipes';

export interface UploadEntry {
  file: File;
  fullPath: string;
  /** Target bucket; 'private' = write-only for clients, result is the fullPath (spec 1.82). */
  bucket?: StorageBucket;
}

/** One retry after a retryable failure (dropped connection, stale App Check token). */
const MAX_UPLOAD_ATTEMPTS = 2;

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
  private downloadUrls: (string | undefined)[] = [];
  private completedCount = 0;

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

    this.downloadUrls = new Array(this.uploads().length).fill(undefined);
    this.uploads().forEach((entry, index) => this.startUpload(entry, index, 1));
  }

  private startUpload(entry: UploadEntry, index: number, attempt: number): void {
    const task = uploadToFirebaseStorage(entry.fullPath, entry.file, entry.bucket);
    this.setState(index, { task, state: 'running', percentage: 0, bytesTransferred: 0 });

    task.on(
      'state_changed',
      (snapshot) => {
        this.setState(index, {
          percentage: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
          state: snapshot.state as UploadState['state'],
        });
      },
      (ex) => {
        const willRetry = attempt < MAX_UPLOAD_ATTEMPTS && isRetryableUploadError(describeUploadError(ex).code);
        this.report('upload', entry, ex, attempt, willRetry);
        if (willRetry) {
          void this.retryUpload(entry, index, attempt + 1);
          return;
        }
        this.setState(index, { state: 'error' });
        this.markCompleted();
      },
      () => {
        // task.on() does not await this callback: an uncaught rejection here would surface as an
        // unhandled rejection AND leave completedCount short, so the modal would never dismiss.
        // No client read on the private bucket — the path is the success signal (spec 1.82 §4).
        const urlPromise: Promise<string> = entry.bucket === 'private'
          ? Promise.resolve(entry.fullPath)
          : getDownloadURL(task.snapshot.ref);
        urlPromise
          .then((url) => {
            this.downloadUrls[index] = url;
            this.setState(index, { state: 'success', downloadUrl: url });
          })
          .catch((ex) => {
            this.report('getDownloadURL', entry, ex, attempt, false);
            this.setState(index, { state: 'error' });
          })
          .finally(() => this.markCompleted());
      }
    );
  }

  /**
   * Second (and last) attempt after a retryable failure. A dropped mobile connection and an App
   * Check token that went stale mid-upload both look like this, and `UploadService` attested only
   * once, BEFORE the first attempt — so re-attest (forced: the cached token may be the rejected
   * one) and start the upload from scratch. Attestation failure is not fatal, same reasoning as
   * `UploadService.attestBeforeUpload`: upload anyway and let the backend decide.
   */
  private async retryUpload(entry: UploadEntry, index: number, attempt: number): Promise<void> {
    this.setState(index, { state: 'pending', percentage: 0, bytesTransferred: 0 });
    try {
      await attestAppCheck(undefined, true);
    } catch {
      // ignore — see above
    }
    this.startUpload(entry, index, attempt);
  }

  private setState(index: number, patch: Partial<UploadState>): void {
    this.uploadStates.update(states => {
      const updated = [...states];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  }

  private markCompleted(): void {
    this.completedCount++;
    if (this.completedCount === this.uploads().length) {
      dismissOverlay(this.modalController, this.downloadUrls, 'confirm');
    }
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
  private report(
    stage: 'upload' | 'getDownloadURL', entry: UploadEntry, ex: unknown, attempt: number, willRetry: boolean
  ): void {
    const { code, message, status, serverResponse } = describeUploadError(ex);
    // A failure we are about to retry is a warning; only the attempt the user sees fail is an error.
    captureMessage(`Upload failed (${stage}): ${code}`, {
      level: willRetry ? 'warning' : 'error',
      tags: {
        uploadStage: stage, uploadErrorCode: code, uploadAttempt: attempt, uploadWillRetry: willRetry,
        uploadHttpStatus: status ?? 'none',
      },
      extra: {
        serverResponse: serverResponse ?? '(none)',
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

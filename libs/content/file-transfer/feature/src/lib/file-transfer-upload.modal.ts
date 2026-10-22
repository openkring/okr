import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonNote, IonProgressBar, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { ResumableSessionExpiredError, uploadResumable } from '@okr/content-file-transfer-data-access';
import { FILE_TRANSFER_I18N_KEYS, FileTransferI18n, PrepareFileTransferUploadResponse, formatFileTransferSize } from '@okr/content-file-transfer-util';

/** Why an upload stopped: the session URL died (prepare again) or anything else. */
export interface FileTransferUploadFailure {
  reason: 'expired' | 'failed';
}

interface UploadRow {
  index: number;
  name: string;
  size: number;
  sent: number;
}

/**
 * Uploads the files of a prepared transfer to their resumable sessions, one after the other, and
 * shows the progress per file. Dismisses with role 'confirm' when every file is stored, with role
 * 'error' and a {@link FileTransferUploadFailure} when one fails. Closing the modal (header close)
 * aborts the running upload; the caller sees role 'cancel'. On any role but 'confirm' the store
 * cancels the still-'uploading' transfer (the reaper is the fallback).
 *
 * Lives in the feature lib, not in ui: it is not a form, it drives the network upload itself
 * (same shape as `UploadTaskModal` in shared/ui for Firebase Storage uploads).
 */
@Component({
  selector: 'okr-file-transfer-upload-modal',
  standalone: true,
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonNote, IonProgressBar],
  styles: [`
    .file-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .file-name { font-weight: 500; max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file-size { font-size: 0.8rem; color: var(--ion-color-medium); }
    ion-progress-bar { height: 6px; border-radius: 3px; }
    .hint { display: block; padding: 16px 16px 0 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.upload_title() }" [isModal]="true" />
    <ion-content>
      <ion-note class="hint">{{ statusText() }}</ion-note>
      <ion-note class="hint">{{ i18n.upload_hint() }}</ion-note>
      <ion-list lines="none">
        @for (row of rows(); track row.index) {
          <ion-item>
            <ion-label>
              <div class="file-info">
                <span class="file-name">{{ row.name }}</span>
                <span class="file-size">{{ sizeText(row.size) }}</span>
              </div>
              <ion-progress-bar [value]="fraction(row)" [color]="row.sent >= row.size ? 'success' : 'primary'" />
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class FileTransferUploadModal implements OnInit, OnDestroy {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(FILE_TRANSFER_I18N_KEYS) as FileTransferI18n;

  // inputs
  public readonly files = input.required<File[]>();
  public readonly uploads = input.required<PrepareFileTransferUploadResponse['uploads']>();

  protected readonly rows = signal<UploadRow[]>([]);
  private readonly current = signal(0);
  private readonly abortController = new AbortController();

  protected readonly statusText = computed(() => {
    const rows = this.rows();
    const row = rows[this.current()];
    if (!row) return '';
    return fill(this.i18n.upload_progress(), { index: this.current() + 1, count: rows.length, name: row.name });
  });

  public ngOnInit(): void {
    const files = this.files();
    this.rows.set(this.uploads().map(u => ({ index: u.index, name: files[u.index]?.name ?? '', size: u.size, sent: 0 })));
    void this.run();
  }

  public ngOnDestroy(): void {
    // header close (or any other dismissal) must not leave a PUT loop running in the background
    this.abortController.abort();
  }

  private async run(): Promise<void> {
    const files = this.files();
    try {
      for (const [i, u] of this.uploads().entries()) {
        const file = files[u.index];
        if (!file) throw new Error(`FileTransferUploadModal: no file for index ${u.index}`);
        this.current.set(i);
        await uploadResumable(u.sessionUrl, file, sent => this.setSent(u.index, sent), { signal: this.abortController.signal });
        this.setSent(u.index, u.size);
      }
      await dismissOverlay(this.modalController, undefined, 'confirm');
    } catch (error) {
      if (this.abortController.signal.aborted) return;   // the user closed the modal → role 'cancel'
      console.warn('FileTransferUploadModal: upload failed', error instanceof Error ? error.name : 'unknown');
      const failure: FileTransferUploadFailure = { reason: error instanceof ResumableSessionExpiredError ? 'expired' : 'failed' };
      await dismissOverlay(this.modalController, failure, 'error');
    }
  }

  private setSent(index: number, sent: number): void {
    this.rows.update(rows => rows.map(r => r.index === index ? { ...r, sent } : r));
  }

  protected fraction(row: UploadRow): number {
    return row.size > 0 ? Math.min(1, row.sent / row.size) : 1;
  }

  protected sizeText(bytes: number): string {
    return formatFileTransferSize(bytes);
  }
}

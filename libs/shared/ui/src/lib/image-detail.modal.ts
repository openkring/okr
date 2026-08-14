import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonRow, IonSpinner, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { getDownloadURL, getMetadata, ref } from 'firebase/storage';
import exifr from 'exifr';

import { STORAGE } from '@okr/shared-config';
import { fileSizeUnit } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

export interface ImageDetailRow { label: string; value: string; }

/**
 * Read-only detail view for an image stored in Firebase Storage.
 * Given a storage path it loads the download URL, the storage metadata
 * (mime, size, dates, md5) and the EXIF tags parsed from the file bytes
 * (via exifr). Callers may pass extra context rows (e.g. the owning section).
 */
@Component({
  selector: 'okr-image-detail-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonSpinner,
    IonContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`
    ion-row { border-bottom: 1px solid var(--ion-color-light); }
    .preview { display: flex; justify-content: center; margin-bottom: 1rem; min-height: 60px; }
    .preview img { max-width: 100%; max-height: 240px; border-radius: 8px; }
    .value { word-break: break-all; }
    .section-title { margin: 1.25rem 0 0.5rem; font-weight: 600; color: var(--ion-color-medium); }
    .hint { color: var(--ion-color-medium); font-style: italic; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ labels().title }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ labels().close }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="preview">
        @if (downloadUrl(); as url) {
          <img [src]="url" [alt]="fileName()" />
        } @else {
          <ion-spinner name="dots" />
        }
      </div>

      <ion-grid>
        @for (row of rows(); track row.label) {
          <ion-row>
            <ion-col size="4"><strong>{{ row.label }}</strong></ion-col>
            <ion-col size="8" class="value">{{ row.value || '—' }}</ion-col>
          </ion-row>
        }
      </ion-grid>

      <div class="section-title">EXIF</div>
      @if (exifLoading()) {
        <ion-spinner name="dots" />
      } @else if (exifRows().length > 0) {
        <ion-grid>
          @for (row of exifRows(); track row.label) {
            <ion-row>
              <ion-col size="4"><strong>{{ row.label }}</strong></ion-col>
              <ion-col size="8" class="value">{{ row.value }}</ion-col>
            </ion-row>
          }
        </ion-grid>
      } @else {
        <p class="hint">{{ exifHint() || i18n.noExif() }}</p>
      }
    </ion-content>
  `,
})
export class ImageDetailModal implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly storage = inject(STORAGE);

  /** Full storage path of the image, e.g. tenant/<tid>/section/<key>/file.jpg */
  public fullPath = input.required<string>();
  /** Optional extra context rows shown above the storage metadata. */
  public extraRows = input<ImageDetailRow[]>([]);
  public title = input<string>();
  public closeLabel = input<string>();

  // Domain-agnostic labels resolved here; a caller may still override title/closeLabel.
  protected readonly i18n = inject(I18nService).translateAll({
    title: '@shared/ui.image.title', close: '@shared/ui.close', name: '@shared/ui.image.name',
    path: '@shared/ui.image.path', mime: '@shared/ui.image.mime', size: '@shared/ui.image.size',
    created: '@shared/ui.image.created', modified: '@shared/ui.image.modified',
    md5: '@shared/ui.image.md5', downloadUrl: '@shared/ui.image.downloadUrl',
    noExif: '@shared/ui.image.noExif', exifError: '@shared/ui.image.exifError',
  });
  protected readonly labels = computed(() => ({
    title: this.title() ?? this.i18n.title(),
    close: this.closeLabel() ?? this.i18n.close(),
  }));

  protected readonly downloadUrl = signal<string | undefined>(undefined);
  protected readonly rows = signal<ImageDetailRow[]>([]);
  protected readonly exifLoading = signal(true);
  protected readonly exifRows = signal<ImageDetailRow[]>([]);
  /** Empty until an EXIF read actually fails; the template falls back to the generic no-EXIF hint. */
  protected readonly exifHint = signal('');

  protected fileName(): string {
    const p = this.fullPath();
    return p.split('/').pop() ?? p;
  }

  public async ngOnInit(): Promise<void> {
    const fullPath = this.fullPath();
    const sref = ref(this.storage, fullPath);

    // storage metadata + download URL
    let url: string | undefined;
    try {
      const [metadata, downloadUrl] = await Promise.all([getMetadata(sref), getDownloadURL(sref)]);
      url = downloadUrl;
      this.downloadUrl.set(downloadUrl);
      this.rows.set([
        ...this.extraRows(),
        { label: this.i18n.name(),        value: this.fileName() },
        { label: this.i18n.path(),        value: fullPath },
        { label: this.i18n.mime(),        value: metadata.contentType ?? '' },
        { label: this.i18n.size(),        value: fileSizeUnit(metadata.size) },
        { label: this.i18n.created(),     value: this.formatIso(metadata.timeCreated) },
        { label: this.i18n.modified(),    value: this.formatIso(metadata.updated) },
        { label: this.i18n.md5(),         value: metadata.md5Hash ?? '' },
        { label: this.i18n.downloadUrl(), value: downloadUrl },
      ]);
    } catch {
      this.rows.set([...this.extraRows(), { label: this.i18n.path(), value: fullPath }]);
    }

    // EXIF parsed from the original bytes (NOT the imgix-transformed image)
    try {
      const exif = url ? await exifr.parse(url, true) : undefined;
      this.exifRows.set(exif ? this.toExifRows(exif as Record<string, unknown>) : []);
    } catch {
      this.exifHint.set(this.i18n.exifError());
      this.exifRows.set([]);
    } finally {
      this.exifLoading.set(false);
    }
  }

  private toExifRows(exif: Record<string, unknown>): ImageDetailRow[] {
    return Object.entries(exif)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([label, v]) => ({ label, value: this.formatExifValue(v) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  private formatExifValue(v: unknown): string {
    if (v instanceof Date) return this.formatIso(v.toISOString());
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /** Render an ISO 8601 timestamp as 'dd.mm.yyyy hh:mm:ss'. */
  private formatIso(iso: string): string {
    if (!iso || iso.length < 10) return iso;
    const [date, rest] = iso.split('T');
    const [y, m, d] = date.split('-');
    const time = (rest ?? '').substring(0, 8);
    return `${d}.${m}.${y}${time ? ' ' + time : ''}`;
  }

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}

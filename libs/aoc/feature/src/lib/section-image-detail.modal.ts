import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonRow, IonSpinner, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import exifr from 'exifr';

import { fileSizeUnit } from '@bk2/shared-util-core';

import { SectionImageRef } from './aoc-content.store';

interface DetailRow { label: string; value: string; }

/**
 * Read-only detail view for a section image that lives in Firebase Storage.
 * Shows the storage metadata (path, name, section, mime type, size, dates, hash)
 * plus EXIF metadata parsed from the file bytes via the exifr library.
 */
@Component({
  selector: 'bk-section-image-detail-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonSpinner,
    IonContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`
    ion-row { border-bottom: 1px solid var(--ion-color-light); }
    .preview { display: flex; justify-content: center; margin-bottom: 1rem; }
    .preview img { max-width: 100%; max-height: 240px; border-radius: 8px; }
    .value { word-break: break-all; }
    .section-title { margin: 1.25rem 0 0.5rem; font-weight: 600; color: var(--ion-color-medium); }
    .hint { color: var(--ion-color-medium); font-style: italic; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ closeLabel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="preview">
        <img [src]="image().downloadUrl" [alt]="fileName()" />
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
        <p class="hint">{{ exifHint() }}</p>
      }
    </ion-content>
  `,
})
export class SectionImageDetailModal implements OnInit {
  private readonly modalController = inject(ModalController);

  public image = input.required<SectionImageRef>();
  public title = input('Bild-Details');
  public closeLabel = input('Schliessen');

  protected readonly exifLoading = signal(true);
  protected readonly exifRows = signal<DetailRow[]>([]);
  protected readonly exifHint = signal('Keine EXIF-Daten vorhanden.');

  protected readonly fileName = computed(() => this.image().fullPath.split('/').pop() ?? this.image().fullPath);

  protected readonly rows = computed<DetailRow[]>(() => {
    const img = this.image();
    return [
      { label: 'Name', value: this.fileName() },
      { label: 'Sektion', value: `${img.section.name} (${img.section.bkey})` },
      { label: 'Typ', value: img.section.type },
      { label: 'Speicherpfad', value: img.fullPath },
      { label: 'MIME-Typ', value: img.contentType },
      { label: 'Grösse', value: fileSizeUnit(img.size) },
      { label: 'Erstellt', value: this.formatIso(img.timeCreated) },
      { label: 'Geändert', value: this.formatIso(img.updated) },
      { label: 'MD5 (Base64)', value: img.md5Hash },
      { label: 'Download-URL', value: img.downloadUrl },
    ];
  });

  public async ngOnInit(): Promise<void> {
    try {
      const exif = await exifr.parse(this.image().downloadUrl, true);
      this.exifRows.set(exif ? this.toExifRows(exif as Record<string, unknown>) : []);
    } catch {
      // CORS, unsupported format, or no EXIF segment — treat as "no data"
      this.exifHint.set('EXIF-Daten konnten nicht gelesen werden.');
      this.exifRows.set([]);
    } finally {
      this.exifLoading.set(false);
    }
  }

  private toExifRows(exif: Record<string, unknown>): DetailRow[] {
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

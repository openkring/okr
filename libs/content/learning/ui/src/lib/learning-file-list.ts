import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { IonButton, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow, IonThumbnail } from '@ionic/angular';

import { LearningI18n } from '@okr/content-learning-util';
import { DocumentModel } from '@okr/shared-models';
import { FileLogoPipe, FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe, ThumbnailUrlPipe } from '@okr/shared-pipes';
import { EmptyList } from '@okr/shared-ui';

/**
 * The «Dateien» tab of a learning room (spec 1.115 §5.2): the document list look (list rows or
 * grid tiles, file-type icon or thumbnail), but presentational — no store, no action sheet.
 * A tap on the row/tile emits `open` (the item detail); the download button emits `download`.
 * The feature decides how to fetch the file.
 */
@Component({
  selector: 'okr-learning-file-list',
  standalone: true,
  imports: [
    NgTemplateOutlet, SvgIconPipe, FileLogoPipe, FileNamePipe, FileSizePipe, PrettyDatePipe, ThumbnailUrlPipe, EmptyList,
    IonList, IonItem, IonLabel, IonThumbnail, IonIcon, IonButton, IonGrid, IonRow, IonCol,
  ],
  styles: [`
    .tile { cursor: pointer; }
    .tile-media { position: relative; width: 100%; padding-bottom: 80%; overflow: hidden; border-radius: 4px; background: var(--ion-color-light); }
    .tile-media ion-thumbnail { position: absolute; inset: 0; --size: 100%; width: 100%; height: 100%; }
    .tile-footer { display: flex; align-items: center; gap: 4px; }
    .tile-title { flex: 1; font-size: 0.75rem; margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-icon { width: 100%; height: 100%; }
  `],
  template: `
    @if (docs().length === 0) {
      <okr-empty-list [message]="i18n().empty_files()" />
    } @else if (view() === 'list') {
      <ion-list>
        @for (doc of docs(); track doc.okey) {
          <ion-item>
            <ion-thumbnail slot="start" class="tile" (click)="open.emit(doc)">
              <ng-container [ngTemplateOutlet]="media" [ngTemplateOutletContext]="{ $implicit: doc }" />
            </ion-thumbnail>
            <ion-label class="tile" (click)="open.emit(doc)">
              <h3>{{ doc.title || (doc.fullPath | fileName) }}</h3>
              <p>{{ doc.fullPath | fileName }} · {{ doc.size | fileSize }} · {{ doc.dateOfDocLastUpdate | prettyDate }}</p>
            </ion-label>
            <ion-button slot="end" fill="clear" [attr.aria-label]="i18n().item_download()" (click)="download.emit(doc)">
              <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
            </ion-button>
          </ion-item>
        }
      </ion-list>
    } @else {
      <ion-grid>
        <ion-row>
          @for (doc of docs(); track doc.okey) {
            <ion-col size="6" size-md="4" size-xl="3">
              <div class="tile tile-media" role="button" tabindex="0" [attr.aria-label]="i18n().item_open()"
                   (click)="open.emit(doc)" (keydown.enter)="open.emit(doc)">
                <ion-thumbnail>
                  <ng-container [ngTemplateOutlet]="media" [ngTemplateOutletContext]="{ $implicit: doc }" />
                </ion-thumbnail>
              </div>
              <div class="tile-footer">
                <p class="tile-title">{{ doc.title || (doc.fullPath | fileName) }}</p>
                <ion-button size="small" fill="clear" [attr.aria-label]="i18n().item_download()" (click)="download.emit(doc)">
                  <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
                </ion-button>
              </div>
            </ion-col>
          }
        </ion-row>
      </ion-grid>
    }

    <ng-template #media let-doc>
      @if (hasThumbnail(doc)) {
        <img [src]="doc.fullPath | thumbnailUrl" [alt]="doc.altText || doc.title" />
      } @else {
        <ion-icon class="file-icon" src="{{ doc.fullPath | fileLogo }}" />
      }
    </ng-template>
  `
})
export class LearningFileList {
  public docs = input<DocumentModel[]>([]);
  public view = input<'list' | 'grid'>('list');
  public i18n = input.required<LearningI18n>();

  public open = output<DocumentModel>();
  public download = output<DocumentModel>();

  /** imgix renders raster images and PDFs; SVG and everything else gets its file-type icon. */
  protected hasThumbnail(doc: DocumentModel): boolean {
    const m = (doc.mimeType ?? '').toLowerCase();
    return (m.startsWith('image/') && m !== 'image/svg+xml') || m === 'application/pdf';
  }
}

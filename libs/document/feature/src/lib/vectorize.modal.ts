import { Component, computed, inject, input, signal } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCol, IonContent, IonGrid, IonItem, IonLabel, IonNote,
  IonRange, IonRow, IonSegment, IonSegmentButton, IonSpinner, ToastController
} from '@ionic/angular/standalone';

import { ENV } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { DocumentModel, DocumentRendering } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { error } from '@okr/shared-util-angular';

import { DocumentService } from '@okr/document-data-access';
import { DOCUMENT_I18N_KEYS, DocumentI18n } from '@okr/document-util';

/**
 * Vectorize a JPG/PNG document into an SVG rendering: source and result side by side, preset +
 * detail knob, and a Generate button that can be re-run until the trace is acceptable.
 * There is no save step — the CF writes the rendering, so a generated result is already persisted.
 * Injects I18nService directly (no DocumentStore) — the store opens this modal, so importing it
 * back would be a circular import.
 */
@Component({
  selector: 'okr-vectorize-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonNote,
    IonSegment, IonSegmentButton, IonRange, IonButton, IonSpinner
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.vectorize_title() }" [isModal]="true" />
    <ion-content>
      <ion-grid>
        <ion-row>
          <ion-col size="12" size-md="6">
            <ion-label><strong>{{ i18n.vectorize_source() }}</strong></ion-label>
            <ion-card>
              <ion-card-content>
                <img [src]="sourceUrl()" [alt]="document().altText" style="width:100%;object-fit:contain;" />
              </ion-card-content>
            </ion-card>
          </ion-col>
          <ion-col size="12" size-md="6">
            <ion-label><strong>{{ i18n.vectorize_result() }}</strong></ion-label>
            <ion-card>
              <ion-card-content>
                @if (isGenerating()) {
                  <ion-spinner />
                } @else if (resultUrl(); as url) {
                  <img [src]="url" [alt]="document().altText" style="width:100%;object-fit:contain;" />
                } @else {
                  <ion-note>{{ i18n.vectorize_empty() }}</ion-note>
                }
              </ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12" size-md="6">
            <ion-item lines="none">
              <ion-label position="stacked">{{ i18n.vectorize_preset() }}</ion-label>
              <ion-segment [value]="preset()" (ionChange)="preset.set($any($event.detail.value))">
                <ion-segment-button value="logo"><ion-label>{{ i18n.vectorize_preset_logo() }}</ion-label></ion-segment-button>
                <ion-segment-button value="photo"><ion-label>{{ i18n.vectorize_preset_photo() }}</ion-label></ion-segment-button>
              </ion-segment>
            </ion-item>
          </ion-col>
          <ion-col size="12" size-md="6">
            <ion-item lines="none">
              <ion-label position="stacked">{{ i18n.vectorize_detail() }}</ion-label>
              <!-- filterSpeckle: lower keeps more small shapes, higher traces cleaner but coarser -->
              <ion-range min="0" max="20" step="1" snaps="true" pin="true"
                         [value]="detail()" (ionChange)="detail.set($any($event.detail.value))" />
            </ion-item>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <ion-note>{{ i18n.vectorize_hint() }}</ion-note>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <ion-button expand="block" [disabled]="isGenerating()" (click)="generate()">
              {{ i18n.vectorize_generate() }}
            </ion-button>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `
})
export class VectorizeModal {
  private readonly env = inject(ENV);
  private readonly documentService = inject(DocumentService);
  private readonly toastController = inject(ToastController);
  protected readonly i18n = inject(I18nService).translateAll(DOCUMENT_I18N_KEYS) as DocumentI18n;

  public readonly document = input.required<DocumentModel>();

  protected readonly preset = signal<'logo' | 'photo'>('logo');
  protected readonly detail = signal(4);
  protected readonly isGenerating = signal(false);
  protected readonly rendering = signal<DocumentRendering | undefined>(undefined);

  protected readonly sourceUrl = computed(() => this.imgixUrl(this.document().fullPath));
  // cache-busted: regenerating overwrites the SAME storage path, so imgix would keep serving the
  // previous trace without a changing query string.
  protected readonly resultUrl = signal('');

  protected async generate(): Promise<void> {
    this.isGenerating.set(true);
    try {
      const rendering = await this.documentService.vectorize(this.document().okey, this.preset(), this.detail());
      this.rendering.set(rendering);
      this.resultUrl.set(`${this.imgixUrl(rendering.fullPath)}?v=${Date.now()}`);
    } catch (ex) {
      error(this.toastController, this.i18n.vectorize_error());
      console.error('VectorizeModal.generate: ', ex);
    } finally {
      this.isGenerating.set(false);
    }
  }

  /** Prepend the imgix base URL for storage paths; external/absolute URLs are used as they are. */
  private imgixUrl(path: string): string {
    return path.startsWith('tenant') ? `${this.env.services.imgixBaseUrl}/${path}` : path;
  }
}

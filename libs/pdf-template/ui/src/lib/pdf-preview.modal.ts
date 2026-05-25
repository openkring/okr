// libs/pdf-template/ui/src/lib/pdf-preview.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonFooter, ModalController,
} from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-pdf-preview-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonFooter,
  ],
  styles: [`
    .preview-frame { width: 100%; height: calc(100vh - 120px); border: none; }
    .no-preview { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="download()">
            <ion-icon src="{{ 'download' | svgIcon }}" slot="icon-only" />
          </ion-button>
          <ion-button (click)="close()">
            <ion-icon src="{{ 'cancel-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if(safeUrl(); as url) {
        @if(outputFormat() === 'pdf') {
          <iframe [src]="url" class="preview-frame" title="PDF Preview"></iframe>
        } @else {
          <div class="no-preview">
            <p>Vorschau nicht verfügbar. Bitte herunterladen.</p>
          </div>
        }
      } @else {
        <div class="no-preview"><p>Kein Dokument geladen.</p></div>
      }
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button fill="outline" (click)="close()">Schliessen</ion-button>
          <ion-button fill="solid" color="primary" (click)="download()">
            <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
            Herunterladen
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class PdfPreviewModal {
  private readonly modalController = inject(ModalController);
  private readonly sanitizer = inject(DomSanitizer);

  public readonly url = input<string>('');
  public readonly title = input<string>('Dokument');
  public readonly filename = input<string>('document.pdf');
  public readonly outputFormat = input<'pdf' | 'docx' | 'html'>('pdf');

  protected readonly safeUrl = computed((): SafeResourceUrl | null => {
    const u = this.url();
    return u ? this.sanitizer.bypassSecurityTrustResourceUrl(u) : null;
  });

  protected async close(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected download(): void {
    const u = this.url();
    if (!u) return;
    const a = document.createElement('a');
    a.href = u;
    a.download = this.filename();
    a.click();
  }
}

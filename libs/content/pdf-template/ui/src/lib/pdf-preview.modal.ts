// libs/content/pdf-template/ui/src/lib/pdf-preview.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  IonButton, IonCol, IonContent, IonGrid, IonIcon, IonRow, ModalController,
} from '@ionic/angular';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { PDF_PREVIEW_I18N_KEYS, PdfPreviewI18n } from '@okr/content-pdf-template-util';
import { EmailComposerModal } from './email-composer.modal';

@Component({
  selector: 'okr-pdf-preview-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe, Header,
    IonButton, IonIcon, IonContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`
    .preview-frame { width: 100%; height: calc(100vh - 180px); border: none; }
    .no-preview { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--ion-color-medium); }
  `],
  template: `
    <okr-header [i18n]="{ title: titleText() }" [isModal]="true" />

    <ion-content>
      <!-- secondary actions as content buttons: a preview has nothing to save -->
      <ion-grid>
        <ion-row>
          <ion-col [size]="canSend() ? 6 : 12">
            <ion-button expand="block" fill="solid" color="primary" (click)="download()">
              <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
              {{ i18n.download() }}
            </ion-button>
          </ion-col>
          @if(canSend()) {
            <ion-col size="6">
              <ion-button expand="block" fill="outline" color="primary" (click)="send()">
                <ion-icon src="{{ 'send' | svgIcon }}" slot="start" />
                {{ i18n.send() }}
              </ion-button>
            </ion-col>
          }
        </ion-row>
      </ion-grid>
      @if(safeUrl(); as url) {
        @if(outputFormat() === 'pdf') {
          <iframe [src]="url" class="preview-frame" [title]="i18n.frame()"></iframe>
        } @else {
          <div class="no-preview">
            <p>{{ i18n.unavailable() }}</p>
          </div>
        }
      } @else {
        <div class="no-preview"><p>{{ i18n.empty() }}</p></div>
      }
    </ion-content>
  `
})
export class PdfPreviewModal {
  private readonly modalController = inject(ModalController);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly i18n = inject(I18nService).translateAll(PDF_PREVIEW_I18N_KEYS) as PdfPreviewI18n;

  public readonly url = input<string>('');
  /** Caller-supplied title (usually the filename); falls back to the translated generic title. */
  public readonly title = input<string>('');
  public readonly filename = input<string>('document.pdf');
  public readonly outputFormat = input<'pdf' | 'docx' | 'html'>('pdf');
  public readonly storagePath = input<string>('');
  public readonly recipientEmail = input<string | undefined>(undefined);
  public readonly recipientName = input<string | undefined>(undefined);

  protected readonly titleText = computed(() => this.title() || this.i18n.title());

  protected readonly safeUrl = computed((): SafeResourceUrl | null => {
    const u = this.url();
    return u ? this.sanitizer.bypassSecurityTrustResourceUrl(u) : null;
  });

  // Senden is offered only for a persisted PDF (the CF resolves the attachment from storagePath).
  protected readonly canSend = computed(() => this.outputFormat() === 'pdf' && this.storagePath().length > 0);

  protected async send(): Promise<void> {
    const modal = await this.modalController.create({
      component: EmailComposerModal,
      componentProps: {
        to: this.recipientEmail() ?? '',
        recipientName: this.recipientName(),
        storagePath: this.storagePath(),
        filename: this.filename(),
        outputFormat: this.outputFormat(),
      },
      cssClass: ['wide-modal', 'auto-height-modal'],
    });
    await modal.present();
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

// libs/content/pdf-template/ui/src/lib/pdf-preview.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonFooter, ModalController,
} from '@ionic/angular/standalone';
import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';
import { PDF_PREVIEW_I18N_KEYS, PdfPreviewI18n } from '@okr/content-pdf-template-util';
import { EmailComposerModal } from './email-composer.modal';

@Component({
  selector: 'okr-pdf-preview-modal',
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
        <ion-title>{{ titleText() }}</ion-title>
        <ion-buttons slot="end">
          @if(canSend()) {
            <ion-button (click)="send()">
              <ion-icon src="{{ 'send' | svgIcon }}" slot="icon-only" />
            </ion-button>
          }
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

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button fill="outline" (click)="close()">{{ i18n.close() }}</ion-button>
          @if(canSend()) {
            <ion-button fill="outline" color="primary" (click)="send()">
              <ion-icon src="{{ 'send' | svgIcon }}" slot="start" />
              {{ i18n.send() }}
            </ion-button>
          }
          <ion-button fill="solid" color="primary" (click)="download()">
            <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
            {{ i18n.download() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
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
    });
    await modal.present();
  }

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

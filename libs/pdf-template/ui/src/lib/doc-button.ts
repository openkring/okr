// libs/pdf-template/ui/src/lib/doc-button.ts
import {
  ChangeDetectionStrategy, Component, EventEmitter, inject,
  input, Output, signal,
} from '@angular/core';
import { IonButton, IonIcon, IonSpinner, ModalController, ToastController } from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';
import {
  DocGenerationService, GenerateDocumentRequest, GenerateDocumentResponse,
} from '@bk2/pdf-template-data-access';
import { PdfPreviewModal } from './pdf-preview.modal';

@Component({
  selector: 'bk-doc-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgIconPipe, IonButton, IonIcon, IonSpinner],
  template: `
    @if(variant() !== 'icon-only') {
      <ion-button
        [fill]="variant() === 'primary' ? 'solid' : 'outline'"
        [disabled]="isLoading()"
        (click)="generate()">
        @if(isLoading()) {
          <ion-spinner name="crescent" slot="start" />
        } @else {
          <ion-icon src="{{ icon() | svgIcon }}" slot="start" />
        }
        {{ label() }}
      </ion-button>
    } @else {
      <ion-button fill="clear" [disabled]="isLoading()" (click)="generate()">
        @if(isLoading()) {
          <ion-spinner name="crescent" slot="icon-only" />
        } @else {
          <ion-icon src="{{ icon() | svgIcon }}" slot="icon-only" />
        }
      </ion-button>
    }
  `
})
export class DocButton {
  private readonly docGenService = inject(DocGenerationService);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);

  public readonly templateId = input.required<string>();
  public readonly payload = input.required<Record<string, unknown>>();
  public readonly templateVersion = input<number | undefined>(undefined);
  public readonly outputFormat = input<'pdf' | 'docx' | 'html'>('pdf');
  public readonly label = input<string>('Dokument erstellen');
  public readonly icon = input<string>('document');
  public readonly variant = input<'primary' | 'secondary' | 'icon-only'>('primary');
  public readonly filename = input<string | undefined>(undefined);
  public readonly autoDownload = input<boolean>(false);
  public readonly autoOpenPreview = input<boolean>(true);
  public readonly entityType = input<string | undefined>(undefined);
  public readonly entityId = input<string | undefined>(undefined);
  public readonly recipientEmail = input<string | undefined>(undefined);
  public readonly recipientName = input<string | undefined>(undefined);

  @Output() public readonly generated = new EventEmitter<GenerateDocumentResponse>();
  @Output() public readonly errorOccurred = new EventEmitter<Error>();

  protected readonly isLoading = signal(false);

  protected async generate(): Promise<void> {
    this.isLoading.set(true);
    const toast = await this.toastController.create({
      message: 'Dokument wird erstellt…',
      duration: 0,
      position: 'bottom',
    });
    const timeoutId = setTimeout(() => toast.present(), 2000);

    try {
      const req: GenerateDocumentRequest = {
        templateId: this.templateId(),
        templateVersion: this.templateVersion(),
        payload: this.payload(),
        options: {
          outputFormat: this.outputFormat(),
          filename: this.filename(),
          storageMode: 'persist',
          metadata: this.entityType()
            ? { entityType: this.entityType(), entityId: this.entityId() }
            : undefined,
        },
      };

      const response = await this.docGenService.generate(req);
      clearTimeout(timeoutId);
      await toast.dismiss();
      this.generated.emit(response);

      if (this.autoDownload()) {
        const a = document.createElement('a');
        a.href = response.url;
        a.download = response.filename;
        a.click();
      } else if (this.autoOpenPreview() && response.outputFormat === 'pdf') {
        const modal = await this.modalController.create({
          component: PdfPreviewModal,
          componentProps: {
            url: response.url,
            title: response.filename,
            filename: response.filename,
            outputFormat: response.outputFormat,
            storagePath: response.storagePath,
            recipientEmail: this.recipientEmail(),
            recipientName: this.recipientName(),
          },
        });
        await modal.present();
      }
    } catch (err) {
      clearTimeout(timeoutId);
      await toast.dismiss();
      const e = err instanceof Error ? err : new Error(String(err));
      this.errorOccurred.emit(e);
      const errToast = await this.toastController.create({
        message: `Fehler: ${e.message}`,
        duration: 4000,
        color: 'danger',
        position: 'bottom',
      });
      await errToast.present();
    } finally {
      this.isLoading.set(false);
    }
  }
}

import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular/standalone';
import { inject } from '@angular/core';

import { Header } from '@bk2/shared-ui';

import { EncryptedFileMetadata, decryptFile } from '@bk2/forms-util';

@Component({
  selector: 'bk-decrypt-files-modal',
  standalone: true,
  imports: [
    FormsModule, Header, DecimalPipe,
    IonContent, IonList, IonItem, IonLabel, IonInput, IonNote, IonButton,
  ],
  template: `
    <bk-header [i18n]="{ title: 'Dateien entschlüsseln' }" [isModal]="true" />
    <ion-content class="ion-padding">

      <ion-note color="medium" style="display:block; padding:12px; border-radius:8px; margin-bottom:16px;">
        Geben Sie das Verschlüsselungspasswort ein. Der Schlüssel verlässt niemals den Browser.
      </ion-note>

      <ion-item>
        <ion-label position="stacked">Passwort</ion-label>
        <ion-input
          type="password"
          [(ngModel)]="password"
          placeholder="Passwort eingeben"
          (keyup.enter)="decryptAll()"
        />
      </ion-item>

      @if (errorMsg()) {
        <ion-note color="danger" style="padding:4px 16px;">{{ errorMsg() }}</ion-note>
      }

      <ion-button
        expand="block"
        style="margin-top:16px;"
        [disabled]="!password || decrypting()"
        (click)="decryptAll()"
      >
        {{ decrypting() ? 'Wird entschlüsselt…' : 'Entschlüsseln & herunterladen' }}
      </ion-button>

      @if (files().length > 1) {
        <ion-list lines="inset" style="margin-top:16px;">
          @for (f of files(); track f.storageUrl) {
            <ion-item>
              <ion-label>
                <p>{{ f.mimeType }} · {{ (f.sizeBytes / 1024) | number:'1.0-0' }} KB</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }

      <ion-button expand="block" fill="outline" color="medium" (click)="dismiss()" style="margin-top:8px;">
        Schliessen
      </ion-button>
    </ion-content>
  `,
})
export class DecryptFilesModal {
  private readonly modalController = inject(ModalController);

  public readonly files = input.required<EncryptedFileMetadata[]>();

  protected password = '';
  protected readonly decrypting = signal(false);
  protected readonly errorMsg = signal('');

  protected async decryptAll(): Promise<void> {
    if (!this.password) return;
    this.decrypting.set(true);
    this.errorMsg.set('');
    try {
      for (const file of this.files()) {
        const plaintext = await decryptFile(
          file.storageUrl,
          file.ivBase64,
          file.saltBase64,
          this.password,
        );
        const blob = new Blob([plaintext], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.encryptedName || 'file';
        anchor.click();
        URL.revokeObjectURL(url);
      }
      await this.modalController.dismiss(null, 'confirm');
    } catch {
      this.errorMsg.set('Entschlüsselung fehlgeschlagen. Falsches Passwort?');
    } finally {
      this.decrypting.set(false);
    }
  }

  protected dismiss(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}

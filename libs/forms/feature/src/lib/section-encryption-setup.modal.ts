import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonCheckbox, IonContent, IonInput, IonItem,
  IonLabel, IonNote, IonText, ModalController,
} from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { Header } from '@bk2/shared-ui';
import { FormDefinitionModel } from '@bk2/shared-models';
import { generateEncryptionPassword, generateSalt, hashPasswordForVerification } from '@bk2/forms-util';
import { FormDefinitionService } from '@bk2/forms-data-access';
import { AppStore } from '@bk2/shared-feature';

@Component({
  selector: 'bk-section-encryption-setup-modal',
  standalone: true,
  imports: [
    FormsModule, Header, SvgIconPipe,
    IonContent, IonItem, IonLabel, IonNote, IonText,
    IonInput, IonCheckbox, IonButton,
  ],
  template: `
    <bk-header [i18n]="{ title: 'Verschlüsselung aktivieren' }" [isModal]="true" />
    <ion-content class="ion-padding">

      <ion-note color="warning" style="display:block; margin-bottom:16px; padding:12px; border-radius:8px;">
        <strong>Achtung:</strong> Dieses Passwort wird nur einmal angezeigt.
        Wenn es verloren geht, sind verschlüsselte Dateien unwiederbringlich verloren.
        Speichern Sie es in einem Passwort-Manager.
      </ion-note>

      <ion-item>
        <ion-label position="stacked">Verschlüsselungspasswort (einmalig angezeigt)</ion-label>
        <ion-input [value]="password()" [readonly]="true" id="enc-password" />
        <ion-button slot="end" fill="clear" (click)="copyPassword()">
          <ion-icon src="{{ 'copy' | svgIcon }}" slot="icon-only" />
        </ion-button>
      </ion-item>

      @if (copied()) {
        <ion-note color="success" style="padding: 4px 16px;">Passwort kopiert.</ion-note>
      }

      <ion-item style="margin-top: 16px;">
        <ion-checkbox [(ngModel)]="confirmed" slot="start" />
        <ion-label class="ion-text-wrap" style="margin-left:12px;">
          Ich habe das Passwort sicher gespeichert und verstehe, dass ein Verlust
          den unwiederbringlichen Verlust aller verschlüsselten Dateien bedeutet.
        </ion-label>
      </ion-item>

      <ion-button
        expand="block"
        style="margin-top:24px;"
        [disabled]="!confirmed || saving()"
        (click)="save()"
      >
        {{ saving() ? 'Wird gespeichert…' : 'Aktivieren' }}
      </ion-button>

      <ion-button expand="block" fill="outline" color="medium" (click)="cancel()" style="margin-top:8px;">
        Abbrechen
      </ion-button>

    </ion-content>
  `,
})
export class SectionEncryptionSetupModal {
  private readonly modalController = inject(ModalController);
  private readonly formDefinitionService = inject(FormDefinitionService);
  private readonly appStore = inject(AppStore);

  public readonly form = input.required<FormDefinitionModel>();

  protected readonly password = signal(generateEncryptionPassword());
  protected readonly copied = signal(false);
  protected readonly saving = signal(false);
  protected confirmed = false;

  protected copyPassword(): void {
    navigator.clipboard.writeText(this.password()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  protected async save(): Promise<void> {
    if (!this.confirmed) return;
    this.saving.set(true);
    try {
      const salt = generateSalt();
      const keyHash = await hashPasswordForVerification(this.password(), salt);
      await this.formDefinitionService.update(
        { ...this.form(), encryptionSalt: salt, encryptionKeyHash: keyHash },
        this.appStore.currentUser(),
      );
      await this.modalController.dismiss({ encryptionSalt: salt }, 'confirm');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}

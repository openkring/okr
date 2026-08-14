import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCheckbox, IonContent, IonIcon, IonInput, IonItem, IonLabel, IonNote, ModalController } from '@ionic/angular/standalone';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { FormDefinitionModel } from '@okr/shared-models';
import { generateEncryptionPassword, generateSalt, hashPasswordForVerification, FORM_I18N_KEYS, FormI18n } from '@okr/forms-util';
import { I18nService } from '@okr/shared-i18n';
import { FormDefinitionService } from '@okr/forms-data-access';
import { AppStore } from '@okr/shared-feature';

@Component({
  selector: 'okr-section-encryption-setup-modal',
  standalone: true,
  imports: [
    FormsModule, Header, SvgIconPipe,
    IonContent, IonItem, IonLabel, IonNote, IonIcon,
    IonInput, IonCheckbox, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.enc_title() }" [isModal]="true" />
    <ion-content class="ion-padding">

      <ion-note color="warning" style="display:block; margin-bottom:16px; padding:12px; border-radius:8px;">
        {{ i18n.enc_warning() }}
      </ion-note>

      <ion-item>
        <ion-label position="stacked">{{ i18n.enc_password() }}</ion-label>
        <ion-input [value]="password()" [readonly]="true" id="enc-password" />
        <ion-button slot="end" fill="clear" (click)="copyPassword()">
          <ion-icon src="{{ 'copy' | svgIcon }}" slot="icon-only" />
        </ion-button>
      </ion-item>

      @if (copied()) {
        <ion-note color="success" style="padding: 4px 16px;">{{ i18n.enc_copied() }}</ion-note>
      }

      <ion-item style="margin-top: 16px;">
        <ion-checkbox [(ngModel)]="confirmed" slot="start" />
        <ion-label class="ion-text-wrap" style="margin-left:12px;">
          {{ i18n.enc_confirm() }}
        </ion-label>
      </ion-item>

      <ion-button
        expand="block"
        style="margin-top:24px;"
        [disabled]="!confirmed || saving()"
        (click)="save()"
      >
        {{ saving() ? i18n.enc_saving() : i18n.enc_activate() }}
      </ion-button>

      <ion-button expand="block" fill="outline" color="medium" (click)="cancel()" style="margin-top:8px;">
        {{ i18n.cancel() }}
      </ion-button>

    </ion-content>
  `,
})
export class SectionEncryptionSetupModal {
  private readonly modalController = inject(ModalController);
  private readonly formDefinitionService = inject(FormDefinitionService);
  private readonly appStore = inject(AppStore);

  public readonly form = input.required<FormDefinitionModel>();

  // Direct inject (no store): the store opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(FORM_I18N_KEYS) as FormI18n;


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

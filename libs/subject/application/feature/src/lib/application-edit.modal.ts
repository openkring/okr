import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { AlertController, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { ApplicationModel, UserModel } from '@bk2/shared-models';
import { AlertService } from '@bk2/shared-util-angular';

import { ApplicationService } from '@bk2/application-data-access';
import { ApplicationI18n } from '@bk2/application-util';
import { ApplicationForm } from '@bk2/application-ui';

@Component({
  selector: 'bk-application-edit-modal',
  standalone: true,
  imports: [
    ApplicationForm,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent
  ],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-title>{{ i18n().edit_title() }}</ion-title>
      <ion-buttons slot="end">
        @if(!isTerminal()) {
          <ion-button (click)="save()">{{ i18n().edit_title() }}</ion-button>
          <ion-button color="success" (click)="accept()">{{ i18n().edit_accept() }}</ion-button>
          <ion-button color="danger"  (click)="deny()">{{ i18n().edit_deny() }}</ion-button>
        }
        <ion-button (click)="dismiss()">{{ i18n().cancel() }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <bk-application-form
      [application]="currentApp()"
      [readonly]="isTerminal()"
      [i18n]="i18n()"
      (applicationChange)="currentApp.set($event)"
    />
  </ion-content>
  `
})
export class ApplicationEditModal {
  private readonly modalController    = inject(ModalController);
  private readonly alertController    = inject(AlertController);
  private readonly applicationService = inject(ApplicationService);
  private readonly alertService       = inject(AlertService);

  public readonly application = input.required<ApplicationModel>();
  public readonly currentUser = input<UserModel>();
  public readonly i18n        = input.required<ApplicationI18n>();

  protected currentApp = linkedSignal(() => this.application());
  protected isTerminal = computed(() => this.currentApp().state.startsWith('closed.'));

  protected async save(): Promise<void> {
    await this.applicationService.update(this.currentApp(), this.currentUser());
    await this.modalController.dismiss({ saved: true }, 'confirm');
  }

  protected async accept(): Promise<void> {
    const confirmed = await this.alertService.confirm(this.i18n().edit_accept_confirm(), true);
    if (confirmed !== true) return;
    const personKey = await this.applicationService.accept(this.currentApp(), this.currentUser());
    await this.modalController.dismiss({ accepted: true, personKey }, 'confirm');
  }

  protected async deny(): Promise<void> {
    const reason = await this.promptForReason();
    if (!reason) return;
    await this.applicationService.deny(this.currentApp(), reason, this.currentUser());
    await this.modalController.dismiss({ denied: true }, 'confirm');
  }

  protected dismiss(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  private async promptForReason(): Promise<string | undefined> {
    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header: this.i18n().edit_deny_reason(),
        inputs: [{ name: 'reason', type: 'text' }],
        buttons: [
          { text: this.i18n().cancel(), role: 'cancel', handler: () => resolve(undefined) },
          { text: this.i18n().edit_deny(), role: 'confirm', handler: (v: Record<string, string>) => resolve(v?.['reason']) }
        ]
      });
      await alert.present();
    });
  }
}

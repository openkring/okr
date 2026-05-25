// libs/pdf-template/feature/src/lib/template-publish.modal.ts
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular/standalone';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonItem, IonLabel, IonTextarea, IonFooter,
} from '@ionic/angular/standalone';

@Component({
  selector: 'bk-template-publish-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonTextarea, IonFooter,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>Version {{ versionNum() }} veröffentlichen</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Abbrechen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">Änderungsnotiz (Pflicht)</ion-label>
        <ion-textarea
          [(ngModel)]="changelog"
          placeholder="Beschreibe die Änderungen in dieser Version…"
          [rows]="4"
          autoGrow="true"
        />
      </ion-item>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button fill="outline" (click)="cancel()">Abbrechen</ion-button>
          <ion-button fill="solid" color="primary" [disabled]="!changelog()" (click)="confirm()">
            Version {{ versionNum() }} veröffentlichen
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class TemplatePublishModal {
  private readonly modalController = inject(ModalController);

  public readonly versionNum = input<number>(1);
  protected readonly changelog = signal('');

  protected async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async confirm(): Promise<void> {
    await this.modalController.dismiss({ changelog: this.changelog() }, 'confirm');
  }
}

// libs/pdf-template/feature/src/lib/template-publish.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular/standalone';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonItem, IonLabel, IonTextarea, IonFooter,
} from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { TEMPLATE_I18N_KEYS, TemplateI18n } from '@okr/pdf-template-util';
import { fill } from '@okr/shared-util-core';

@Component({
  selector: 'okr-template-publish-modal',
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
        <ion-title>{{ publishTitle() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ i18n.publish_changelog() }}</ion-label>
        <ion-textarea
          [(ngModel)]="changelog"
          [placeholder]="i18n.publish_changelog_ph()"
          [rows]="4"
          autoGrow="true"
        />
      </ion-item>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button fill="outline" (click)="cancel()">{{ i18n.cancel() }}</ion-button>
          <ion-button fill="solid" color="primary" [disabled]="!changelog()" (click)="confirm()">
            {{ publishTitle() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class TemplatePublishModal {
  private readonly modalController = inject(ModalController);

  public readonly versionNum = input<number>(1);

  // Direct inject (no store): TemplateStore opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(TEMPLATE_I18N_KEYS) as TemplateI18n;
  protected readonly publishTitle = computed(() => fill(this.i18n.publish_title(), { version: this.versionNum() }));
  protected readonly changelog = signal('');

  protected async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async confirm(): Promise<void> {
    await this.modalController.dismiss({ changelog: this.changelog() }, 'confirm');
  }
}

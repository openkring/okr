import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AssetStore } from './asset.store';

@Component({
  selector: 'bk-depreciation-run-page',
  standalone: true,
  imports: [
    FormsModule, 
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonInput
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.deduction_run() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">{{ store.i18n.period_end() }}</ion-label>
        <ion-input [(ngModel)]="periodEnd" />
      </ion-item>
      <ion-button expand="block" (click)="preview()">{{ store.i18n.preview() }}</ion-button>
      @if (store.previewLines().length > 0) {
        <ion-list>
          @for (line of store.previewLines(); track line.accountKey) {
            <ion-item>
              <ion-label>{{ line.accountKey }}</ion-label>
              <ion-note slot="end">{{ line.debitAmount?.amount }}</ion-note>
            </ion-item>
          }
        </ion-list>
        <ion-button expand="block" color="primary" (click)="post()">{{ store.i18n.book() }}</ion-button>
      }
    </ion-content>
  `,
})
export class DepreciationRunPage {
  protected readonly store = inject(AssetStore);

  protected periodEnd = '';

  protected async preview(): Promise<void> {
    await this.store.preview(this.periodEnd);
  }

  protected async post(): Promise<void> {
    await this.store.post();
  }
}

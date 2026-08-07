import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonItem, IonNote, IonRow, IonTextarea, IonToggle } from '@ionic/angular/standalone';

import { TocConfig } from '@okr/shared-models';
import { parseTocKeys, stringifyTocKeys, withTocDefaults } from '@okr/cms-section-util';

interface TocConfigI18n {
  toc_title:                 Signal<string>;
  toc_subtitle:              Signal<string>;
  toc_sectionKeys_label:     Signal<string>;
  toc_sectionKeys_helper:    Signal<string>;
  toc_numbered_label:        Signal<string>;
  toc_numbered_helper:       Signal<string>;
}

@Component({
  selector: 'okr-toc-config',
  standalone: true,
  imports: [
    FormsModule,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle, IonGrid, IonRow, IonCol, IonItem, IonTextarea, IonNote, IonToggle
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-textarea { font-family: monospace; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().toc_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().toc_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none">
                <ion-textarea
                  [label]="i18n().toc_sectionKeys_label()"
                  labelPlacement="stacked"
                  fill="outline"
                  [rows]="5"
                  [autoGrow]="true"
                  [readonly]="readOnly()"
                  [ngModel]="draft()"
                  (ngModelChange)="draft.set($event)"
                  (ionBlur)="commitKeys()"
                />
              </ion-item>
              <ion-item lines="none">
                <ion-note>{{ i18n().toc_sectionKeys_helper() }}</ion-note>
              </ion-item>
            </ion-col>
            <ion-col size="12">
              <ion-item lines="none">
                <ion-toggle
                  [checked]="config().numbered"
                  [disabled]="readOnly()"
                  (ionChange)="onNumberedChange($event.detail.checked)"
                >{{ i18n().toc_numbered_label() }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-note>{{ i18n().toc_numbered_helper() }}</ion-note>
              </ion-item>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class TocConfiguration {
  // inputs
  public formData = model.required<TocConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<TocConfigI18n>();

  /** Legacy sections lack the newer fields — never bind the raw properties. */
  protected config = computed(() => withTocDefaults(this.formData()));
  /** Section keys as text; reseeded from formData, committed on blur. */
  protected draft = linkedSignal(() => stringifyTocKeys(this.config().sectionKeys));

  protected commitKeys(): void {
    this.formData.set({ ...this.config(), sectionKeys: parseTocKeys(this.draft()) });
  }

  protected onNumberedChange(numbered: boolean): void {
    this.formData.set({ ...this.config(), numbered });
  }
}

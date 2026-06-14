import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { RagConfig } from '@bk2/shared-models';
import { NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';

interface RagConfigI18n {
  rag_config_title:                 Signal<string>;
  rag_config_subtitle:              Signal<string>;
  rag_config_model_label:           Signal<string>;
  rag_config_model_placeholder:     Signal<string>;
  rag_config_model_helper:          Signal<string>;
  rag_config_storeName_label:       Signal<string>;
  rag_config_storeName_placeholder: Signal<string>;
  rag_config_storeName_helper:      Signal<string>;
  rag_config_systemPrompt_label:        Signal<string>;
  rag_config_systemPrompt_placeholder:  Signal<string>;
  rag_config_systemPrompt_helper:       Signal<string>;
  rag_config_documentScope_label:       Signal<string>;
  rag_config_documentScope_placeholder: Signal<string>;
  rag_config_documentScope_helper:      Signal<string>;
  rag_config_maxTokens_label:       Signal<string>;
  rag_config_maxTokens_placeholder: Signal<string>;
  rag_config_maxTokens_helper:      Signal<string>;
}

@Component({
  selector: 'bk-rag-config',
  standalone: true,
  imports: [
    TextInput, NumberInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().rag_config_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().rag_config_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="modelI18n()" [value]="model_()" (valueChange)="onFieldChange('model', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="storeNameI18n()" [value]="storeName()" (valueChange)="onFieldChange('storeName', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="systemPromptI18n()" [value]="systemPrompt()" (valueChange)="onFieldChange('systemPrompt', $event)" [readOnly]="readOnly()" [maxLength]="2000" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="documentScopeI18n()" [value]="documentScope()" (valueChange)="onFieldChange('documentScope', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-number-input [i18n]="maxTokensI18n()" [value]="maxTokens() ?? 0" (valueChange)="onNumberChange('maxTokens', $event)" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class RagConfiguration {
  // inputs
  public formData = model.required<RagConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<RagConfigI18n>();

  // fields ('model_' to avoid clashing with the Angular model() import name)
  protected model_ = linkedSignal(() => this.formData().model ?? '');
  protected storeName = linkedSignal(() => this.formData().storeName ?? '');
  protected systemPrompt = linkedSignal(() => this.formData().systemPrompt ?? '');
  protected documentScope = linkedSignal(() => this.formData().documentScope ?? '');
  protected maxTokens = linkedSignal(() => this.formData().maxTokens ?? undefined);

  protected modelI18n = computed(() => ({
    name: 'model', label: this.i18n().rag_config_model_label(),
    placeholder: this.i18n().rag_config_model_placeholder(), helper: this.i18n().rag_config_model_helper(),
  } as TextInputI18n));

  protected storeNameI18n = computed(() => ({
    name: 'storeName', label: this.i18n().rag_config_storeName_label(),
    placeholder: this.i18n().rag_config_storeName_placeholder(), helper: this.i18n().rag_config_storeName_helper(),
  } as TextInputI18n));

  protected systemPromptI18n = computed(() => ({
    name: 'systemPrompt', label: this.i18n().rag_config_systemPrompt_label(),
    placeholder: this.i18n().rag_config_systemPrompt_placeholder(), helper: this.i18n().rag_config_systemPrompt_helper(),
  } as TextInputI18n));

  protected documentScopeI18n = computed(() => ({
    name: 'documentScope', label: this.i18n().rag_config_documentScope_label(),
    placeholder: this.i18n().rag_config_documentScope_placeholder(), helper: this.i18n().rag_config_documentScope_helper(),
  } as TextInputI18n));

  protected maxTokensI18n = computed(() => ({
    name: 'maxTokens', label: this.i18n().rag_config_maxTokens_label(),
    placeholder: this.i18n().rag_config_maxTokens_placeholder(), helper: this.i18n().rag_config_maxTokens_helper(),
  } as NumberInputI18n));

  protected onFieldChange(fieldName: string, value: string): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }

  protected onNumberChange(fieldName: string, value: number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }
}

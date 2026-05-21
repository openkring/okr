import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TextInput, TextInputI18n, UrlInput, UrlInputI18n } from '@bk2/shared-ui';
import { IframeConfig } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

@Component({
  selector: 'bk-iframe-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    TextInput, UrlInput
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-url [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="styleI18n()" [value]="style()" (valueChange)="onFieldChange('style', $event)" [readOnly]="readOnly()" [maxLength]=200 />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
  `
})
export class IframeConfiguration {
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<IframeConfig>();
  public title = input('@content.section.type.iframe.edit');
  public subTitle = input('@content.section.type.iframe.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected style = linkedSignal(() => this.formData().style ?? 'width: 100%; min-height:400px; border: none;');
  protected url = linkedSignal(() => this.formData().url ?? '');

  protected readonly fieldI18n = this.i18nService.translateAll({
    style_label:       PFX + 'style.label',
    style_placeholder: PFX + 'style.placeholder',
    style_helper:      PFX + 'style.helper',
    url_label:         PFX + 'url.label',
    url_placeholder:   PFX + 'url.placeholder',
    url_helper:        PFX + 'url.helper',
  });

  protected styleI18n = computed(() => ({
    name: 'style',
    label: this.fieldI18n.style_label(),
    placeholder: this.fieldI18n.style_placeholder(),
    helper: this.fieldI18n.style_helper(),
  } as TextInputI18n));
  protected urlI18n = computed(() => ({
    name: 'url',
    label: this.fieldI18n.url_label(),
    placeholder: this.fieldI18n.url_placeholder(),
    helper: this.fieldI18n.url_helper(),
  } as UrlInputI18n));

  protected onFieldChange(fieldName: string, $event: string): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}

import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TextInputComponent, UrlInputComponent } from '@bk2/shared-ui';
import { IframeConfig } from '@bk2/shared-models';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-iframe-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    TextInputComponent, UrlInputComponent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() | translate | async }}</ion-card-title>
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
                <bk-url [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="style" [value]="style()" (valueChange)="onFieldChange('style', $event)" label="@input.style.label" [readOnly]="readOnly()" placeholder="@input.style.placeholder" [maxLength]=200 helperText="@input.style.helper" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
  `
})
export class IframeConfigComponent {
  // inputs
  public formData = model.required<IframeConfig>();
  public title = input('@content.section.type.iframe.edit');
  public subTitle = input('@content.section.type.iframe.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected style = linkedSignal(() => this.formData().style ?? 'width: 100%; min-height:400px; border: none;');
  protected url = linkedSignal(() => this.formData().url ?? '');

  protected onFieldChange(fieldName: string, $event: string): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}

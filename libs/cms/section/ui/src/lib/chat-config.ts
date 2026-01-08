import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChatConfig } from '@bk2/shared-models';
import { CheckboxComponent, StringSelectComponent, TextInputComponent } from '@bk2/shared-ui';
import { DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_URL } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-chat-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    TextInputComponent, CheckboxComponent, StringSelectComponent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `  

    <ion-card>
      <ion-card-header>
          <ion-card-title>{{ title() | translate | async}}</ion-card-title>
          <ion-card-subtitle>{{ subTitle() | translate | async}}</ion-card-subtitle>
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
              <bk-text-input name="id" [value]="id()" (valueChange)="onFieldChange('id', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-string-select name="type"  [selectedString]="type()" (selectedStringChange)="onFieldChange('type', $event)" [readOnly]="readOnly()" [stringList] = "['messaging', 'ai', 'livestream', 'team', 'gaming']" /> 
              <small>
                <div [innerHTML]="typeDescription"></div>
              </small>                    
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showChannelList" [checked]="showChannelList()" (checkedChange)="onFieldChange('showChannelList', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="url" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" [maxLength]="400" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="description" [value]="description()" (valueChange)="onFieldChange('description', $event)" [maxLength]="400" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ChatConfigComponent {
  // inputs
  public formData = model.required<ChatConfig>();
  public title = input('@content.section.type.chat.title');
  public subTitle = input('@content.section.type.chat.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected id = linkedSignal(() => this.formData().id ?? DEFAULT_ID);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected type = linkedSignal(() => this.formData().type ?? 'messaging');
  protected url = linkedSignal(() => this.formData().url ?? DEFAULT_URL);
  protected description = linkedSignal(() => this.formData().description ?? DEFAULT_NOTES);
  protected showChannelList = linkedSignal(() => this.formData().showChannelList ?? true);

  protected typeDescription = `
  <p>Wähle den Chat-Typ basierend auf deinem Anwendungsfall:</p>
  <ul>
    <li><strong>messaging</strong>: Good default for dating, marketplace, and other social app chat use cases.</li>
    <li><strong>ai</strong>: Chat mit KI-Unterstützung (LLM-style), including text, voice & video.</li>
    <li><strong>livestream</strong>: Chat für Livestreams (Shopping) und Events.</li>
    <li><strong>team</strong>: Interner Team-Chat, similar to Slack.</li>
    <li><strong>gaming</strong>: Chat für Video Gaming-Communities.</li>
  </ul>
  `;

  protected onFieldChange(fieldName: string, $event: string | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}

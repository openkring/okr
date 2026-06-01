import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ChatConfig } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_URL } from '@bk2/shared-constants';

interface ChatConfigI18n {
  chat_title:      Signal<string>;
  chat_subtitle:   Signal<string>;
  id_label:          Signal<string>;
  id_placeholder:    Signal<string>;
  id_helper:         Signal<string>;
  name_label:        Signal<string>;
  name_placeholder:  Signal<string>;
  name_helper:       Signal<string>;
  url_label:         Signal<string>;
  url_placeholder:   Signal<string>;
  url_helper:        Signal<string>;
  description_label:       Signal<string>;
  description_placeholder: Signal<string>;
  description_helper:      Signal<string>;
  type_label:              Signal<string>;
  showChannelList_label:   Signal<string>;
  showChannelList_helper:  Signal<string>;
}

@Component({
  selector: 'bk-chat-config',
  standalone: true,
  imports: [
    TextInput, Checkbox, StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `

    <ion-card>
      <ion-card-header>
          <ion-card-title>{{ i18n().chat_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().chat_subtitle() }}</ion-card-subtitle>
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
              <bk-text-input [i18n]="idI18n()" [value]="id()" (valueChange)="onFieldChange('id', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-string-select [i18n]="typeI18n()" [selectedString]="type()" (selectedStringChange)="onFieldChange('type', $event)" [readOnly]="readOnly()" [stringList]="['messaging', 'ai', 'livestream', 'team', 'gaming']" />
              <small>
                <div [innerHTML]="typeDescription"></div>
              </small>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showChannelListI18n()" [checked]="showChannelList()" (checkedChange)="onFieldChange('showChannelList', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" [maxLength]="400" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [maxLength]="400" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ChatConfiguration {
  // inputs
  public formData = model.required<ChatConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<ChatConfigI18n>();

  // fields
  protected id = linkedSignal(() => this.formData().id ?? DEFAULT_ID);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected type = linkedSignal(() => this.formData().type ?? 'messaging');
  protected url = linkedSignal(() => this.formData().url ?? DEFAULT_URL);
  protected description = linkedSignal(() => this.formData().description ?? DEFAULT_NOTES);
  protected showChannelList = linkedSignal(() => this.formData().showChannelList ?? true);

  protected idI18n = computed(() => ({
    name: 'id',
    label: this.i18n().id_label(),
    placeholder: this.i18n().id_placeholder(),
    helper: this.i18n().id_helper(),
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper(),
  } as TextInputI18n));

  protected urlI18n = computed(() => ({
    name: 'url',
    label: this.i18n().url_label(),
    placeholder: this.i18n().url_placeholder(),
    helper: this.i18n().url_helper(),
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().description_label(),
    placeholder: this.i18n().description_placeholder(),
    helper: this.i18n().description_helper(),
  } as TextInputI18n));
  protected typeI18n = computed(() => ({ name: 'type', label: this.i18n().type_label() } as StringSelectI18n));

  protected showChannelListI18n = computed(() => ({
    name: 'showChannelList',
    label: this.i18n().showChannelList_label(),
    helper: this.i18n().showChannelList_helper(),
  } as CheckboxI18n));

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

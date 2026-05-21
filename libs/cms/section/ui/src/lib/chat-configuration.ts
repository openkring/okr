import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ChatConfig } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_URL } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
          <ion-card-title>{{ title() }}</ion-card-title>
          <ion-card-subtitle>{{ subTitle() }}</ion-card-subtitle>
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
  private readonly i18nService = inject(I18nService);

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

  protected readonly fieldI18n = this.i18nService.translateAll({
    id_label:          PFX + 'id.label',
    id_placeholder:    PFX + 'id.placeholder',
    id_helper:         PFX + 'id.helper',
    name_label:        PFX + 'name.label',
    name_placeholder:  PFX + 'name.placeholder',
    name_helper:       PFX + 'name.helper',
    url_label:         PFX + 'url.label',
    url_placeholder:   PFX + 'url.placeholder',
    url_helper:        PFX + 'url.helper',
    description_label:       PFX + 'description.label',
    description_placeholder: PFX + 'description.placeholder',
    description_helper:      PFX + 'description.helper',
    type_label:              PFX + 'chatType.label',
    showChannelList_label:   PFX + 'showChannelList.label',
    showChannelList_helper:  PFX + 'showChannelList.helper',
  });

  protected idI18n = computed(() => ({
    name: 'id',
    label: this.fieldI18n.id_label(),
    placeholder: this.fieldI18n.id_placeholder(),
    helper: this.fieldI18n.id_helper(),
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.fieldI18n.name_label(),
    placeholder: this.fieldI18n.name_placeholder(),
    helper: this.fieldI18n.name_helper(),
  } as TextInputI18n));

  protected urlI18n = computed(() => ({
    name: 'url',
    label: this.fieldI18n.url_label(),
    placeholder: this.fieldI18n.url_placeholder(),
    helper: this.fieldI18n.url_helper(),
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description',
    label: this.fieldI18n.description_label(),
    placeholder: this.fieldI18n.description_placeholder(),
    helper: this.fieldI18n.description_helper(),
  } as TextInputI18n));
  protected typeI18n = computed(() => ({ name: 'type', label: this.fieldI18n.type_label() } as StringSelectI18n));

  protected showChannelListI18n = computed(() => ({
    name: 'showChannelList',
    label: this.fieldI18n.showChannelList_label(),
    helper: this.fieldI18n.showChannelList_helper(),
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

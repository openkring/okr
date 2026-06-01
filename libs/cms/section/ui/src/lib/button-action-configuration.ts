import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ButtonAction, ButtonActionConfig } from '@bk2/shared-models';
import { CategoryOld, CategoryOldI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { DEFAULT_LABEL, DEFAULT_URL } from '@bk2/shared-constants';
import { ButtonActions } from '@bk2/shared-categories';

interface ButtonActionI18n {
  actionUrl_label:       Signal<string>;
  actionUrl_placeholder: Signal<string>;
  actionUrl_helper:      Signal<string>;
  altText_label:         Signal<string>;
  altText_placeholder:   Signal<string>;
  altText_helper:        Signal<string>;
  buttonAction_label:    Signal<string>;
}

@Component({
  selector: 'bk-button-action',
  standalone: true,
  imports: [
    FormsModule,
    TextInput, CategoryOld,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>Action - Konfiguration</ion-card-title>
        <ion-card-subtitle>Definiere was bei einem Klick auf den Button passieren soll.</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }

        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-category-old [i18n]="buttonActionI18n()" [value]="type()" (valueChange)="onFieldChange('type', $event)" [categories]="buttonActions" [readOnly]="readOnly()" />
            </ion-col>
            @if(type() !== BA.None) {
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="actionUrlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" [maxLength]=400 />
              </ion-col>
            }
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="altTextI18n()" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="readOnly()" [maxLength]=400 />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ButtonActionConfiguration {

  // inputs
  public formData = model.required<ButtonActionConfig>();
  public title = input('@content.section.type.button.action.title');
  public subTitle = input('@content.section.type.button.action.subtitle');
  public readonly i18n = input.required<ButtonActionI18n>();
  public intro = input<string>(`
  <ul>
  <li><strong>Download:</strong> Der Button startet einen Download der mittels URL referenzierten Datei. Die URL muss auf eine Datei im Firebase Storage zeigen.</li>
  <li><strong>Navigieren:</strong> Der Button navigiert zur angegebenen URL. Die URL muss eine interne Route sein (siehe dazu die MenuItem Konfiguration).</li>
  <li><strong>Browse:</strong> Der Button linkt auf eine externe URL (https://domain.com/path).</li>
  <li><strong>Zoom:</strong> Die in der URL referenzierte Datei wird in einem Zoom-Viewer angezeigt (typischerweise ein Bild). Die URL muss auf eine Datei im Firebase Storage zeigen.</li>
  <li><strong>Keine:</strong> Keine Aktion wird ausgeführt. Die URL wird ignoriert. Dies ist die Default-Einstellung.</li>
  </ul>
  `);

  public readonly readOnly = input(true);

  // fields
  protected type = linkedSignal(() => this.formData().type ?? ButtonAction.Download);
  protected url = linkedSignal(() => this.formData().url ?? DEFAULT_URL);
  protected altText = linkedSignal(() => this.formData().altText ?? DEFAULT_LABEL);

  // passing constants to template
  protected BA = ButtonAction;
  protected buttonActions = ButtonActions;



  protected actionUrlI18n = computed(() => ({
    name: 'actionUrl',
    label: this.i18n().actionUrl_label(),
    placeholder: this.i18n().actionUrl_placeholder(),
    helper: this.i18n().actionUrl_helper(),
  } as TextInputI18n));

  protected altTextI18n = computed(() => ({
    name: 'altText',
    label: this.i18n().altText_label(),
    placeholder: this.i18n().altText_placeholder(),
    helper: this.i18n().altText_helper(),
  } as TextInputI18n));
  protected buttonActionI18n = computed(() => ({ name: 'buttonAction', label: this.i18n().buttonAction_label() } as CategoryOldI18n));

  protected onFieldChange(fieldName: string, $event: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}

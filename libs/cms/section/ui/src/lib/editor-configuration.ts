import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { ViewPositions } from '@bk2/shared-categories';
import { EditorConfig, ViewPosition } from '@bk2/shared-models';
import { BkEditor, ButtonCopyI18n, CategoryOld, CategoryOldI18n, NumberInput, NumberInputI18n } from '@bk2/shared-ui';

interface EditorConfigI18n {
  editor_title:               Signal<string>;
  editor_colSize_label:       Signal<string>;
  editor_colSize_placeholder: Signal<string>;
  editor_colSize_helper:      Signal<string>;
  editor_position_label:      Signal<string>;
  copy_conf:                  Signal<string>;
}

@Component({
  selector: 'bk-editor-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote,
    NumberInput, CategoryOld, BkEditor
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().editor_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <ion-note>{{ intro }}</ion-note>
          }
        }
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              @defer (on idle) {
                <bk-editor [content]="htmlContent()" (contentChange)="onFieldChange('htmlContent', $event)" [readOnly]="readOnly()" [buttonCopyI18n]="buttonCopyI18n()" />
              }
            </ion-col>
            @if(showAdvanced()) {
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="positionI18n()" [value]="position()" (valueChange)="onFieldChange('position', $event)" [readOnly]="readOnly()" [categories]="positions" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-number-input [i18n]="colSizeI18n()" [value]="colSize()" (valueChange)="onFieldChange('colSize', $event)" [readOnly]="readOnly()" [showHelper]="true" />
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class EditorConfiguration {
  // inputs
  public formData = model.required<EditorConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly showAdvanced = input(false);
  public readonly i18n = input.required<EditorConfigI18n>();

  // derived
  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf() } as ButtonCopyI18n));
  protected colSizeI18n = computed(() => ({ name: 'colSize', label: this.i18n().editor_colSize_label(), placeholder: this.i18n().editor_colSize_placeholder(), helper: this.i18n().editor_colSize_helper() } as NumberInputI18n));
  protected positionI18n = computed(() => ({ name: 'position', label: this.i18n().editor_position_label() } as CategoryOldI18n));

  // fields
  protected htmlContent = linkedSignal(() => this.formData().htmlContent ?? '<p></p>');
  protected colSize = linkedSignal(() => this.formData().colSize ?? 4);
  protected position = linkedSignal(() => this.formData().position ?? ViewPosition.None);

  // passing constants to template
  protected positions = ViewPositions;

    /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, $event: string | number | ViewPosition): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}

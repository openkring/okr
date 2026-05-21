import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { ViewPositions } from '@bk2/shared-categories';
import { EditorConfig, ViewPosition } from '@bk2/shared-models';
import { BkEditor, ButtonCopyI18n, CategoryOld, CategoryOldI18n, NumberInput, NumberInputI18n } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';

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
        <ion-card-title>{{ title() }}</ion-card-title>
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
            <ion-col size="12" size-md="6">
              <bk-category-old [i18n]="positionI18n()" [value]="position()" (valueChange)="onFieldChange('position', $event)" [readOnly]="readOnly()" [categories]="positions" />
            </ion-col>  
            <ion-col size="12" size-md="6">
              <bk-number-input [i18n]="colSizeI18n()" [value]="colSize()" (valueChange)="onFieldChange('colSize', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>  
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class EditorConfiguration {
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    colSize_label:       PFX + 'colSize.label',
    colSize_placeholder: PFX + 'colSize.placeholder',
    colSize_helper:      PFX + 'colSize.helper',
    position_label:      PFX + 'position.label',
    copy_conf:           '@shared/ui.copy.conf',
  });
  protected buttonCopyI18n = computed(() => ({ copy_conf: this.fieldI18n.copy_conf() } as ButtonCopyI18n));
  protected colSizeI18n = computed(() => ({ name: 'colSize', label: this.fieldI18n.colSize_label(), placeholder: this.fieldI18n.colSize_placeholder(), helper: this.fieldI18n.colSize_helper() } as NumberInputI18n));
  protected positionI18n = computed(() => ({ name: 'position', label: this.fieldI18n.position_label() } as CategoryOldI18n));

  // inputs
  public formData = model.required<EditorConfig>();
  public title = input('@content.section.forms.content.title');
  public intro = input<string>();
  public readonly readOnly = input(true);

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

import { AsyncPipe } from '@angular/common';
import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { ViewPositions } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { EditorConfig, ViewPosition } from '@bk2/shared-models';
import { CategoryComponent, EditorComponent, NumberInputComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-editor-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote,
    NumberInputComponent, CategoryComponent, EditorComponent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() | translate | async }}</ion-card-title>
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
              <bk-editor [content]="htmlContent()" (contentChange)="onFieldChange('htmlContent', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="position" [value]="position()" (valueChange)="onFieldChange('position', $event)" [readOnly]="readOnly()" [categories]="positions" />
            </ion-col>  
            <ion-col size="12" size-md="6">
              <bk-number-input name="colSize" [value]="colSize()" (valueChange)="onFieldChange('colSize', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>  
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class EditorConfigComponent {
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

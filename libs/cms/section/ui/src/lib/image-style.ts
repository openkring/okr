import { AsyncPipe } from '@angular/common';
import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { ImageActions } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryComponent, CheckboxComponent, NumberInputComponent, StringSelectComponent, TextInputComponent } from '@bk2/shared-ui';
import { ImageActionType, ImageStyle, Slot } from '@bk2/shared-models';


@Component({
  selector: 'bk-image-style',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote,
    CheckboxComponent, TextInputComponent, StringSelectComponent, CategoryComponent, NumberInputComponent
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
            <ion-note>{{ intro }}</ion-note>
          }
        }
        <ion-grid>
          <ion-row>
            <ion-col size="12">  
              <bk-text-input name="imgIxParams" [value]="imgIxParams()" (valueChange)="onFieldChange('imgIxParams', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input name="width" [value]="width()" (valueChange)="onFieldChange('width', $event)" [readOnly]="readOnly()" />
            </ion-col>  
            <ion-col size="12" size-md="6"> 
              <bk-text-input name="height" [value]="height()" (valueChange)="onFieldChange('height', $event)" [readOnly]="readOnly()" />
            </ion-col>  
            <ion-col size="12" size-md="6">
              <bk-text-input name="sizes" [value]="sizes()" (valueChange)="onFieldChange('sizes', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>  
            <ion-col size="12" size-md="6">
              <bk-text-input name="border" [value]="border()" (valueChange)="onFieldChange('border', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>  
            <ion-col size="12" size-md="6">
              <bk-text-input name="borderRadius" [value]="borderRadius()" (valueChange)="onFieldChange('borderRadius', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>  
            <ion-col size="12" size-md="6">
              <bk-checkbox name="isThumbnail" [checked]="isThumbnail()" (checkedChange)="onFieldChange('isThumbnail', $event)" [readOnly]="readOnly()" />
            </ion-col>  
            <ion-col size="12" size-md="6">
             <bk-string-select
                name="slot"
                [selectedString]="slot()"
                (selectedStringChange)="onFieldChange('slot', $event)"
                [readOnly]="readOnly()"
                [stringList]="stringList"
              />
            </ion-col>
            <ion-col size="12" size-md="6">
                <bk-checkbox name="fill" [checked]="fill()" (checkedChange)="onFieldChange('fill', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasPriority" [checked]="hasPriority()" (checkedChange)="onFieldChange('hasPriority', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="imageAction" [value]="action()" (valueChange)="onFieldChange('imageAction', $event)" [readOnly]="readOnly()" [categories]="imageActions" />
            </ion-col>  
            <ion-col size="12" size-md="6">
              <bk-number-input name="zoomFactor" [value]="zoomFactor()" (valueChange)="onFieldChange('zoomFactor', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>  
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ImageStyleComponent {
  // inputs
  public formData = model.required<ImageStyle>();
  public title = input('@content.section.forms.imageStyle.title');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected imgIxParams = linkedSignal(() => this.formData().imgIxParams ?? '');
  protected width = linkedSignal(() => this.formData().width ?? '160');
  protected height = linkedSignal(() => this.formData().height ?? '90');
  protected sizes = linkedSignal(() => this.formData().sizes ?? '(max-width: 1240px) 50vw, 300px');
  protected border = linkedSignal(() => this.formData().border ?? '1px');
  protected borderRadius = linkedSignal(() => this.formData().borderRadius ?? '4px');
  protected isThumbnail = linkedSignal(() => this.formData().isThumbnail ?? false);
  protected slot = linkedSignal(() => this.formData().slot ?? 'none');
  protected fill = linkedSignal(() => this.formData().fill ?? true);
  protected hasPriority = linkedSignal(() => this.formData().hasPriority ?? true);
  protected action = linkedSignal(() => this.formData().action ?? ImageActionType.None);
  protected zoomFactor = linkedSignal(() => this.formData().zoomFactor ?? 2);

  // passing constants to template
  protected imageActions = ImageActions;
  protected stringList = ['start', 'end', 'icon-only'];

  protected onFieldChange(fieldName: string, fieldValue: string | boolean | ImageActionType | Slot): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}

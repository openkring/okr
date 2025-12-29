import { Component, input, linkedSignal, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ButtonStyle, ColorIonic } from '@bk2/shared-models';
import { CategoryComponent, StringSelectComponent, TextInputComponent } from '@bk2/shared-ui';
import { DEFAULT_LABEL, ICON_SIZE } from '@bk2/shared-constants';
import { ColorsIonic } from '@bk2/shared-categories';

import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-button-style',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    FormsModule,
    TextInputComponent, CategoryComponent,
    StringSelectComponent,
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
                  <bk-text-input name="label" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                  <bk-string-select name="shape"  [selectedString]="shape()" (selectedStringChange)="onFieldChange('shape', $event)" [readOnly]="readOnly()" [stringList] = "['round', 'default']" />           
              </ion-col>
              <ion-col size="12" size-md="6">
                  <bk-string-select name="fill"  [selectedString]="fill()" (selectedStringChange)="onFieldChange('fill', $event)" [readOnly]="readOnly()" [stringList] = "['clear', 'outline', 'solid']" />           
              </ion-col>
              <ion-col size="12">
                  <bk-text-input name="width" [value]="width()" (valueChange)="onFieldChange('width', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12"> 
                  <bk-text-input name="height" [value]="height()" (valueChange)="onFieldChange('height', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12">
                  <bk-cat name="color" [value]="color()" (valueChange)="onFieldChange('color', $event)" [categories]="colors" [readOnly]="readOnly()" />
              </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ButtonStyleComponent {
  // inputs
  public formData = model.required<ButtonStyle>();
  public title = input('@content.section.type.button.style.title');
  public subTitle = input('@content.section.type.button.style.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected label = linkedSignal(() => this.formData().label ?? DEFAULT_LABEL);
  protected shape = linkedSignal(() => this.formData().shape ?? 'default');
  protected fill = linkedSignal(() => this.formData().fill ?? 'clear');
  protected width = linkedSignal(() => this.formData().width ?? ICON_SIZE);
  protected height = linkedSignal(() => this.formData().height ?? ICON_SIZE);
  protected color = linkedSignal(() => this.formData().color ?? ColorIonic.Primary);

  // passing constants to template
  protected colors = ColorsIonic;

  protected onFieldChange(fieldName: string, $event: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}

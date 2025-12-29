import { AsyncPipe } from '@angular/common';
import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { FormsModule } from '@angular/forms';

import { ColorsIonic, NameDisplays } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ColorIonic, NameDisplay, UserModel, PeopleConfig } from '@bk2/shared-models';
import { CategoryComponent, CheckboxComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';

import { AvatarsComponent } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-people-config',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    CategoryComponent, AvatarsComponent,
    CheckboxComponent, TextInputComponent, NumberInputComponent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      @if(currentUser(); as currentUser) {
        <bk-avatars (selectClicked)="selectClicked.emit()"
          [(avatars)]="persons"
          [readOnly]="readOnly()"
          [currentUser]="currentUser"
          title="@content.type.people.label"
          addLabel="@content.type.people.addLabel" />
      }

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ headerTitle() | translate | async}}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="title" [value]="title()" (valueChange)="onFieldChange('title', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="altText" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showName" [checked]="showName()" (checkedChange)="onFieldChange('showName', $event)" [readOnly]="isReadOnly()" />
              </ion-col>  
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showLabel" [checked]="showLabel()" (checkedChange)="onFieldChange('showLabel', $event)" [readOnly]="isReadOnly()" />
              </ion-col>  
              <ion-col size="12" size-md="6">
                <bk-number-input name="cols" [value]="cols()" (valueChange)="onFieldChange('cols', $event)" [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col> 
              <ion-col size="12" size-md="6">
                <bk-cat name="color" [value]="color()" (valueChange)="onFieldChange('color', $event)" [readOnly]="isReadOnly()" [categories]="colors" />                                               
              </ion-col>  
              <ion-col size="12" size-md="6">
                <bk-cat name="nameDisplay" [value]="nameDisplay()" (valueChange)="onFieldChange('nameDisplay', $event)" [readOnly]="isReadOnly()" [categories]="nameDisplays" />                                               
              </ion-col>  
              <ion-col size="12" size-md="6">
                <bk-text-input name="linkedSection" [value]="linkedSection()" (valueChange)="onFieldChange('linkedSection', $event)" [readOnly]="isReadOnly()" [showHelper]=true />                                               
              </ion-col> 
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
  `
})
export class PeopleConfigComponent {
  // inputs
  public formData = model.required<PeopleConfig>();
  public headerTitle = input('@content.section.type.people.edit');
  public currentUser = input.required<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  public selectClicked = output<void>();

  // linked signals (fields)
  protected title = linkedSignal(() => this.formData()?.avatar?.title ?? 'Avatar');
  protected altText = linkedSignal(() => this.formData()?.avatar?.altText ?? 'avatar');
  protected showName = linkedSignal(() => this.formData()?.avatar?.showName ?? true);
  protected showLabel = linkedSignal(() => this.formData()?.avatar?.showLabel ?? false);
  protected cols = linkedSignal(() => this.formData()?.avatar?.cols ?? 1);
  protected color = linkedSignal(() => this.formData()?.avatar?.color ?? ColorIonic.Primary);
  protected nameDisplay = linkedSignal(() => this.formData()?.avatar?.nameDisplay ?? NameDisplay.FirstLast);
  protected linkedSection = linkedSignal(() => this.formData()?.avatar?.linkedSection ?? '');
  protected persons = linkedSignal(() => this.formData()?.persons ?? []);

  // passing constants to template
  protected nameDisplays = NameDisplays;
  protected colors = ColorsIonic;

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}

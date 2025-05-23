
import { Component, computed, input, model, output } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, ItemReorderEventDetail } from '@ionic/angular/standalone';
import { MaskitoDirective } from '@maskito/angular';

import { SvgIconPipe } from '@bk2/shared/pipes';
import { getIndexOfKey } from '@bk2/shared/util';
import { TranslatePipe } from '@bk2/shared/i18n';
import { LowercaseWordMask, MaskPredicate } from '@bk2/shared/config';
import { BaseProperty } from '@bk2/shared/models';

@Component({
  selector: 'bk-property-list',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MaskitoDirective,
    IonList, IonItem, IonButton,
    IonLabel, IonInput, IonIcon,
    IonReorderGroup, IonReorder, IonNote,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-item lines="none">
          <ion-input name="key" [value]="newProperty.key" (ionInput)="onKeyChanged($event)"
            label="key"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="20"
            placeholder="ssssss"
            [maskito]="wordMask()"
            [maskitoElement]="maskPredicate" />
          <ion-input name="value" [value]="newProperty.value" (ionInput)="onValueChanged($event)"
            label="value"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="50"
            placeholder="string | number | boolean"/>
            <!-- tbd: input the type of the value; default: string -->
          <ion-button [disabled]="isDisabled()" (click)="add()">Add</ion-button>
        </ion-item>

        @if(propertyList(); as propertyList) {
          @if(propertyList.length === 0) {
            <ion-item lines="none">
              <ion-note>{{emptyLabel() | translate | async}}</ion-note>
            </ion-item>
          } @else {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]="false" (ionItemReorder)="reorder($any($event))">
                @for(property of propertyList; track property.key) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ property.key }}</ion-label>
                    <ion-label>{{ property.value }}</ion-label>
                    <ion-icon src="{{'close_cancel_circle' | svgIcon }}" (click)="remove(property.key)" slot="end" />
                  </ion-item>
                }
              </ion-reorder-group>
            </ion-list>
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class PropertyListComponent {
  public propertyList = model.required<BaseProperty[]>(); // the keys of the menu items
  public name = input('property');
  public wordMask = input(LowercaseWordMask);
  public changed = output<BaseProperty[]>();

  protected title = computed(() => '@input.' + this.name() + '.label');
  protected emptyLabel = computed(() => '@input.' + this.name() + '.empty');

  protected maskPredicate = MaskPredicate;
  protected newProperty: BaseProperty = { key: '', value: '' };

  protected onKeyChanged(event: CustomEvent): void {
    this.newProperty.key = event.detail.value;
  }

  protected onValueChanged(event: CustomEvent): void {
    this.newProperty.value = event.detail.value;
  }
  
  protected isDisabled() {
    return this.newProperty['key'] === '' || this.newProperty['value'] === '';
  }

  protected add(): void {
    if (this.newProperty.key.length > 0 && this.propertyList()) {
      this.propertyList().push(this.newProperty);
      this.newProperty = { key: '', value: '' };
      this.changed.emit(this.propertyList());
    }
  }

  protected remove(propertyKey: string): void {
    this.propertyList().splice(getIndexOfKey(this.propertyList(), propertyKey), 1);
    this.changed.emit(this.propertyList());
  }

/**
 * Finish the reorder and position the item in the DOM based on where the gesture ended.
 * @param ev the custom dom event with the reordered items
 */
  protected reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.propertyList.set(ev.detail.complete(this.propertyList()));
    this.changed.emit(this.propertyList());
  }
}



import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, ItemReorderEventDetail } from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { LowercaseWordMask } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { BaseProperty } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { getIndexOfKey } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-property-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MaskitoDirective, FormsModule,
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
          <ion-input
            name="key"
            [ngModel]="newKey()"
            (ngModelChange)="newKey.set($event.detail.value)"
            label="key"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="20"
            placeholder="ssssss"
            [maskito]="wordMask()"
            [maskitoElement]="maskPredicate" />
          <ion-input
            name="value"
            [ngModel]="newValue()"
            (ngModelChange)="newValue.set($event.detail.value)"
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

        @if(properties(); as properties) {
          @if(properties.length === 0) {
            <ion-item lines="none">
              <ion-note>{{emptyLabel() | translate | async}}</ion-note>
            </ion-item>
          } @else {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]="false" (ionItemReorder)="reorder($any($event))">
                @for(property of properties; track property.key) {
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
  // inputs
  public properties = model.required<BaseProperty[]>(); // the keys of the menu items
  public name = input('property');
  public wordMask = input(LowercaseWordMask);

  // signals
  protected newKey = signal('');
  protected newValue = signal('');

  // fields
  protected isDisabled = computed(() => this.newKey() === '' || this.newValue() === '');
  protected title = computed(() => '@input.' + this.name() + '.label');
  protected emptyLabel = computed(() => '@input.' + this.name() + '.empty');

  // passing constants to template
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();

  protected add(): void {
    if (this.newKey().length > 0 && this.newValue().length > 0 && this.properties()) {
      const properties = this.properties();
      // prevent adding duplicate keys
      if (getIndexOfKey(properties, this.newKey()) !== -1) {
        return;
      }
      properties.push({ key: this.newKey(), value: this.newValue() });
      this.properties.set(properties);
      this.resetInput();
    }
  }

  protected resetInput(): void {
    this.newKey.set('');
    this.newValue.set('');
  }

  protected remove(propertyKey: string): void {
    this.properties.set(this.properties().splice(getIndexOfKey(this.properties(), propertyKey), 1));
  }

/**
 * Finish the reorder and position the item in the DOM based on where the gesture ended.
 * @param ev the custom dom event with the reordered items
 */
  protected reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.properties.set(ev.detail.complete(this.properties()));
  }
}


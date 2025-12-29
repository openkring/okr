
import { AsyncPipe } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, ItemReorderEventDetail } from '@ionic/angular/standalone';
import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { LowercaseWordMask } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryItemModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { die } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-category-items',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MaskitoDirective,
    IonList, IonItem, IonButton,
    IonLabel, IonInput, IonIcon,
    IonReorderGroup, IonReorder,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() | translate | async }}</ion-card-title>
        <ion-card-subtitle>{{ subTitle() | translate | async }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-item lines="none">
          <ion-input name="name" [value]="newItem.name" (ionInput)="onChange('name', $event)"
            label="name"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="20"
            placeholder="ssssss"
            [maskito]="wordMask()"
            [maskitoElement]="maskPredicate" />
          <ion-input name="abbreviation" [value]="newItem.abbreviation" (ionInput)="onChange('abbreviation', $event)"
            label="abbreviation"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="5"
            placeholder="s"/>
          <ion-input name="icon" [value]="newItem.icon" (ionInput)="onChange('icon', $event)"
            label="icon"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="20"
            placeholder="ssssss"/>
          <ion-button [disabled]="isDisabled()" (click)="add()">Add</ion-button>
        </ion-item>

        @if(items(); as items) {
          @if(items.length === 0) {
            <ion-item lines="none">
              <ion-label>{{'@input.categoryItems.empty' | translate | async}}</ion-label>
            </ion-item>
          } @else {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]="false" (ionItemReorder)="reorder($any($event))">
                @for(item of items; track $index) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ item.name }}</ion-label>
                    <ion-label>{{ item.abbreviation }}</ion-label>
                    <ion-label>{{ item.icon }}</ion-label>
                    <ion-icon src="{{'close_cancel_circle' | svgIcon }}" (click)="remove(item.name)" slot="end" />
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
export class CategoryItemsComponent {
  public items = model.required<CategoryItemModel[]>(); 
  public title = input('@input.categoryItems.title');
  public subTitle = input('@input.categoryItems.subTitle');
  public wordMask = input(LowercaseWordMask);
  public changed = output<CategoryItemModel[]>();
  
  protected newItem = new CategoryItemModel('', '', '');

  protected onChange(fieldName: keyof CategoryItemModel, event: CustomEvent): void {
    switch (fieldName) {
      case 'name':
        this.newItem.name = event.detail.value as string;
        break;
      case 'abbreviation':
        this.newItem.abbreviation = event.detail.value as string;
        break;
      case 'icon':
        this.newItem.icon = event.detail.value as string;
        break;
      case 'state': 
        this.newItem.state = event.detail.value as string;
        break;
      case 'price':
        this.newItem.price = parseInt(event.detail.value);
        break;
      case 'currency':
        this.newItem.currency = event.detail.value as string;
        break;
      case 'periodicity':
        this.newItem.periodicity = event.detail.value as string;
        break;
      default:
        die(`CategoryItemsComponent.onChange: unknown field name: ${fieldName}`);
    }
  }
  
  protected isDisabled() {
    return this.newItem['name'] === '' || this.newItem['abbreviation'] === ''|| this.newItem['icon'] === '';
  }

  protected add(): void {
    this.items().push(this.newItem);
    this.newItem = new CategoryItemModel('', '', '');
    this.changed.emit(this.items());
  }

  protected remove(name: string): void {
    this.items().splice(this.getIndexOfItem(this.items(), name), 1);
    this.changed.emit(this.items());
  }

/**
 * Finish the reorder and position the item in the DOM based on where the gesture ended.
 * @param ev the custom dom event with the reordered items
 */
  protected reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.items.set(ev.detail.complete(this.items()));
    this.changed.emit(this.items());
  }

  /**
   * Returns the index of the first occurrence of a name in a CategoryItemModel array, or -1 if it is not present.
   * @param items the CategoryItemModel array to search in
   * @param name the name to search for
   * @returns the index of the given name, or -1 if it is not present
   */
  private getIndexOfItem(items: CategoryItemModel[], name: string): number {
    for (let i = 0; i < items.length; i++) {
      if (items[i].name === name) return i;
    }
    return -1;
  }

  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();
}

import { Component, computed, inject, input, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, ItemReorderEventDetail } from '@ionic/angular/standalone';
import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { LowercaseWordMask } from '@okr/shared-config';
import { CategoryItemModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { die } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

export interface CategoryItemsI18n {
  title: string;
  subTitle: string;
  add: string;
  empty: string;
}

@Component({
  selector: 'okr-category-items',
  standalone: true,
  imports: [
    SvgIconPipe,
    MaskitoDirective,
    IonList, IonItem, IonButton,
    IonLabel, IonInput, IonIcon,
    IonReorderGroup, IonReorder,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ labels().title }}</ion-card-title>
        <ion-card-subtitle>{{ labels().subTitle }}</ion-card-subtitle>
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
          @if(hasAbbreviation()) {
            <ion-input name="abbreviation" [value]="newItem.abbreviation" (ionInput)="onChange('abbreviation', $event)"
              label="abbreviation"
              labelPlacement="floating"
              inputMode="text"
              type="text"
              [counter]="true"
              [maxlength]="5"
              placeholder="s"/>
          }
          <ion-input name="icon" [value]="newItem.icon" (ionInput)="onChange('icon', $event)"
            label="icon"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="20"
            placeholder="ssssss"/>
          <ion-button [disabled]="isDisabled()" (click)="add()">{{ labels().add }}</ion-button>
        </ion-item>

        @if(items(); as items) {
          @if(items.length === 0) {
            <ion-item lines="none">
              <ion-label>{{ labels().empty }}</ion-label>
            </ion-item>
          } @else {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]="false" (ionItemReorder)="reorder($any($event))">
                @for(item of items; track $index) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ item.name }}</ion-label>
                    @if(hasAbbreviation()) {
                      <ion-label>{{ item.abbreviation }}</ion-label>
                    }
                    <ion-label>{{ item.icon }}</ion-label>
                    <ion-icon src="{{'cancel' | svgIcon }}" (click)="remove(item.name)" slot="end" />
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
export class CategoryItems {
  public items = model.required<CategoryItemModel[]>();
  public i18n = input<Partial<CategoryItemsI18n>>({});

  // Domain-agnostic defaults resolved here; a caller may still override any single label.
  private readonly defaults = inject(I18nService).translateAll({
    title: '@shared/ui.categoryItems.title', subTitle: '@shared/ui.categoryItems.subTitle',
    add: '@shared/ui.categoryItems.add', empty: '@shared/ui.categoryItems.empty',
  });
  protected readonly labels = computed<CategoryItemsI18n>(() => ({
    title:    this.i18n().title    ?? this.defaults.title(),
    subTitle: this.i18n().subTitle ?? this.defaults.subTitle(),
    add:      this.i18n().add      ?? this.defaults.add(),
    empty:    this.i18n().empty    ?? this.defaults.empty(),
  }));
  public wordMask = input(LowercaseWordMask);
  public hasAbbreviation = input<boolean>(false);
  public changed = output<CategoryItemModel[]>();
  
  protected newItem = new CategoryItemModel('', '');

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
        die(`CategoryItems.onChange: unknown field name: ${fieldName}`);
    }
  }
  
  protected isDisabled() {
    return this.newItem['name'] === '' || this.newItem['abbreviation'] === ''|| this.newItem['icon'] === '';
  }

  protected add(): void {
    this.items().push(this.newItem);
    this.newItem = new CategoryItemModel('', '');
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

  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as unknown as HTMLIonInputElement).getInputElement();
}

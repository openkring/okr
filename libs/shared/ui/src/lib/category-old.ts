import { Component, computed, input, model } from '@angular/core';
import { IonItem, IonLabel, IonNote, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { compareCategories } from '@bk2/shared-categories';
import { CategoryModel } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';

export interface CategoryOldI18n {
  name: string;
  label: string;
  helper?: string;
}

/**
 * A component to select a category from a list of categories.
 * The selected category is shown as a ready-only text if the `readOnly` input is true.
 * Usage example:
 *  <bk-cat [i18n]="catI18n()" [value]="orgType" (valueChange)="onFieldChange('orgType', $event)" [categories]="orgTypes" [readOnly]="false" />
 */
@Component({
  selector: 'bk-category-old',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonItem, IonSelect, IonSelectOption, IonNote, IonLabel
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    @if(selectedCategory(); as selectedCategory) {
      <ion-item lines="none">
        @if(isReadOnly()) {
          <ion-label>{{ i18n().label }}: {{ selectedCategory.i18nBase + '.label' | translate | async  }}</ion-label>
        } @else {
          <ion-select [name]="i18n().name" (ionChange)="onCategoryChange($event)"
            [label]="i18n().label"
            [disabled]="isReadOnly()"
            label-placement="floating"
            interface="popover"
            [value]="selectedCategory"
            [compareWith]="compareWith">
            @for (cat of this.categories(); track cat) {
              <ion-select-option [value]="cat">
    <!--
              unfortunately, Ionic is not supporting icons within ion-select-option
    -->
                {{ cat.i18nBase + '.label' | translate | async }}
              </ion-select-option>
            }
          </ion-select>
        }
      </ion-item>
    }
    @if(i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class CategoryOld {
  public i18n = input.required<CategoryOldI18n>();
  public value = model.required<number>(); // the selected category id
  public categories = input.required<CategoryModel[]>(); // mandatory view model
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected selectedCategory = computed(() => {
    const id = this.value();
    return this.categories().find(cat => cat.id === id) ?? null;
  });

  /**
   * Compare two Categories.
   * Return true if they are the same.
   */
  public compareWith(cat1: CategoryModel, cat2: CategoryModel): boolean {
    return compareCategories(cat1, cat2);
  }

  public onCategoryChange($event: Event): void {
    const category = ($event.target as HTMLInputElement).value as unknown as CategoryModel;
    this.value.set(category.id);
  }
}


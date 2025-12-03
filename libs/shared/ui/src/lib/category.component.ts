import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { IonItem, IonLabel, IonNote, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { compareCategories } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryModel } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';

/**
 * A component to select a category from a list of categories.
 * The selected category is shown as a ready-only text if the `readOnly` input is true.
 * Usage example:
 *  <bk-cat name="orgType" [(value)]="orgType" [categories]="orgTypes" [readOnly]="false" />
 *  name and readOnly are optional
 */
@Component({
  selector: 'bk-cat',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonItem, IonSelect, IonSelectOption, IonNote, IonLabel
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      @if(isReadOnly()) {
        <ion-label>{{ this.label() | translate | async }}: {{ '@' + this.selectedCategory().i18nBase + '.label' | translate | async }}</ion-label>
      } @else {
        <ion-select [name]="name()" (ionChange)="onCategoryChange($event)"
          label="{{ this.label() | translate | async }}"
          [disabled]="isReadOnly()"
          label-placement="floating"
          interface="popover"
          [value]="this.selectedCategory()"
          [compareWith]="compareWith">
          @for (cat of this.categories(); track cat) {
            <ion-select-option [value]="cat">
  <!--       
            unfortunately, Ionic is not supporting icons within ion-select-option   
  -->            
              {{ '@' + cat.i18nBase + '.label' | translate | async }}
            </ion-select-option>
          }
        </ion-select>
      }
    </ion-item>
    @if(shouldShowHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
    </ion-item>
  }
  `
})
export class CategoryComponent {
  public name = input('cat'); // name of the input field, determines the label of the input field
  public value = model.required<number>(); // mandatory view model
  public categories = input.required<CategoryModel[]>(); // mandatory view model
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));

  protected label = computed(() => `@input.${this.name()}.label`);
  protected selectedCategory = computed(() => this.categories()[this.value()]);

  protected changed = output<number>();   // we need this notification when selecting a category in the toolbar

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
    this.changed.emit(category.id);
  }
}


import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonCol, IonGrid, IonRow, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel } from '@bk2/shared-models';
import { coerceBoolean, getYear, getYearList } from '@bk2/shared-util-core';

import { CategorySelectComponent } from './category-select.component';
import { SearchbarComponent } from './searchbar.component';
import { SingleTagComponent } from './single-tag.component';
import { YearSelectComponent } from './year-select.component';

/**
 * This component shows a list of filters in a toolbar at the top of a list.
 * The filters are input fields to define filter criterias for the list.
 * 
 * The order of the filters is as follows:
 * 1. search
 * 2. tags
 * 3. category e.g. OwnershipCategory (ocat_), MembershipCategory (mcat_)
 * 4. type 
 * 5. year
 * 6. state tbd: move to db mstate_, ostate_, pstate_, rstate_, 
 */
@Component({
  selector: 'bk-list-filter',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    SearchbarComponent, SingleTagComponent, CategorySelectComponent, YearSelectComponent,
    IonToolbar, IonGrid, IonRow, IonCol
  ],
  template: `
    <ion-toolbar>
      <ion-grid class="ion-no-padding ion-align-items-center">
        <ion-row class="ion-align-items-center">
          @if(showSearch()) {
            <ion-col size="6" size-md="3" class="ion-no-padding">
              <bk-searchbar (ionInput)="onSearchTermChange($event)" placeholder="{{ '@general.operation.search.placeholder' | translate | async  }}" />
            </ion-col>
          }
          @if(showTags()) {
            <ion-col size="6" size-md="2" class="ion-no-padding">
              <bk-single-tag [selectedTag]="selectedTag()" [tags]="tags()" />
            </ion-col>
          }
          @if(showCategory()) {
            <ion-col size="6" size-md="3" class="ion-no-padding">
              <bk-cat-select [selectedItemName]="selectedCategory()" (selectedItemNameChange)="categoryChanged.emit($event)" [category]="categories()!" [withAll]="true" [readOnly]="false" [showIcons]="shouldShowIcons()" />
            </ion-col>
          }
          @if(showType()) {
            <ion-col size="6" size-md="3" class="ion-no-padding">
              <bk-cat-select [selectedItemName]="selectedType()" (selectedItemNameChange)="typeChanged.emit($event)" [category]="types()!" [withAll]="true" [readOnly]="false" [showIcons]="shouldShowIcons()" />
            </ion-col>
          }                                                  
          @if(showYear()) {
            <ion-col size="6" size-md="2" class="ion-no-padding">
              <bk-year-select [selectedYear]="selectedYear()" (selectedYearChange)="yearChanged.emit($event)" [years]="yearList()" [label]="yearLabel()!" [readOnly]="false" [showAllYears]="true" />
            </ion-col>
          }
          @if(showState()) {
            <ion-col size="6" size-md="2" class="ion-no-padding">
              <bk-cat-select [selectedItemName]="selectedState()" (selectedItemNameChange)="stateChanged.emit($event)" [category]="states()!" [withAll]="true" [readOnly]="false" [showIcons]="shouldShowIcons()" />
            </ion-col>
          }
        </ion-row>
      </ion-grid>
    </ion-toolbar>

  `
})
export class ListFilterComponent {
  // inputs
  // data inputs per filter (optional, if undefined (= not used on the bk-list-filter), the filter is not shown)
  public tags = input<string>('');
  public types = input<CategoryListModel>();
  public categories = input<CategoryListModel>();
  public years = input<number[]>();
  public states = input<CategoryListModel>();

  public selectedTag = input<string>('');
  public selectedType = input<string>('');
  public selectedCategory = input<string>('');
  public selectedYear = input<number>(getYear());
  public selectedState = input<string>('all');

  public showIcons = input(true);
  public showSearch = input(true);
  public yearLabel = input<string>();

  // coerced boolean inputs
  protected shouldShowIcons = computed(() => coerceBoolean(this.showIcons()));

  // name the popups per filter name
  protected catName = computed(() => this.categories()?.name);
  protected typeName = computed(() => this.types()?.name);
  protected stateName = computed(() => this.states()?.name);

 // filter visibility
  protected showTags = computed(()     => this.tags() !== undefined && this.selectedTag() !== undefined);
  protected showType = computed(()     => this.types() !== undefined && this.selectedType() !== undefined);
  protected showCategory = computed(() => this.categories() !== undefined && this.selectedCategory() !== undefined);
  protected showYear = computed(()     => this.years() !== undefined && this.selectedYear() !== undefined);
  protected showState = computed(()    => this.states() !== undefined && this.selectedState() !== undefined && this.selectedState() !== undefined);
  protected yearList = computed(()     => this.years() ?? getYearList());   // default is last 8 years

  // outputs
  public searchTermChanged = output<string>();
  public tagChanged = output<string>();
  public typeChanged = output<string>();
  public categoryChanged = output<string>();
  public yearChanged = output<number>();
  public stateChanged = output<string>();

  protected onSearchTermChange($event: Event): void {
    this.searchTermChanged.emit(($event.target as HTMLInputElement).value);
  }
}

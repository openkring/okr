import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonCol, IonGrid, IonRow, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { AllCategories, CategoryListModel, CategoryModel } from '@bk2/shared-models';

import { CategorySelectComponent } from './category-select.component';
import { CategoryComponent } from './category.component';
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
    SearchbarComponent, SingleTagComponent, CategorySelectComponent, CategoryComponent, YearSelectComponent,
    IonToolbar, IonGrid, IonRow, IonCol
  ],
  template: `
    <ion-toolbar>
      <ion-grid>
        <ion-row>
          @if(showSearch()) {
            <ion-col size="6" size-md="3">
              <bk-searchbar placeholder="{{ '@general.operation.search.placeholder' | translate | async  }}" (ionInput)="onSearchTermChange($event)" />
            </ion-col>
          }
          @if(showTags()) {
            <ion-col size="6" size-md="2">
              <bk-single-tag [tags]="tags()!" (selectedTag)="tagChanged.emit($event)" />
            </ion-col>
          }
          @if(showCategory()) {
            <ion-col size="6" size-md="3">
              <bk-cat-select [category]="category()!" selectedItemName="all" popoverId="catName()" [withAll]="true" (changed)="categoryChanged.emit($event)" />
            </ion-col>
          }
          @if(showType()) {
            <ion-col size="6" size-md="3">
              <bk-cat [name]="typeName()!" [value]="allCategory" [categories]="types()!" (changed)="typeChanged.emit($event)" /> 
            </ion-col>
          }                                                  
          @if(showYear()) {
            <ion-col size="6" size-md="2">
              <bk-year-select [label]="yearLabel()!" (changed)="yearChanged.emit($event)" [showAllYears]="true" />
            </ion-col>
          }
          @if(showState()) {
            <ion-col size="6" size-md="2">
              <bk-cat [name]="stateName()!" [value]="allCategory" [categories]="states()!" (changed)="stateChanged.emit($event)" />
            </ion-col>
          }
        </ion-row>
      </ion-grid>
    </ion-toolbar>

  `
})
export class ListFilterComponent {
  // data inputs per filter (optional, if undefined, the filter is not shown)
  public showSearch = input(true);
  public tags = input<string>();
  public category = input<CategoryListModel>();
  public types = input<CategoryModel[]>();
  public years = input<number[]>();
  public states = input<CategoryModel[]>();

  // name inputs per filter (optional, if undefined, the filter is not shown)
  public typeName = input<string>();
  public yearLabel = input<string>();
  public stateName = input<string>();

 // filter definitions
  protected showTags = computed(()     => this.tags() !== undefined);
  protected showCategory = computed(() => this.category() !== undefined);
  protected showType = computed(()     => this.types() !== undefined && this.typeName);
  protected showYear = computed(()     => this.years() !== undefined && this.yearLabel);
  protected showState = computed(()    => this.states() !== undefined && this.stateName);

  // outputs
  public searchTermChanged = output<string>();
  public tagChanged = output<string>();
  public categoryChanged = output<string>();
  public typeChanged = output<number>();
  public yearChanged = output<number>();
  public stateChanged = output<number>();

  protected allCategory = AllCategories;

  protected onSearchTermChange($event: Event): void {
    const _searchTerm = ($event.target as HTMLInputElement).value;
    this.searchTermChanged.emit(_searchTerm);
  }
}

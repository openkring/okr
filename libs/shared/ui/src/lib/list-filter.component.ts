import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonCol, IonGrid, IonRow, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel } from '@bk2/shared-models';

import { CategorySelectComponent } from './category-select.component';
import { SearchbarComponent } from './searchbar.component';
import { SingleTagComponent } from './single-tag.component';
import { YearSelectComponent } from './year-select.component';
import { coerceBoolean } from '@bk2/shared-util-core';

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
      <ion-grid>
        <ion-row>
          @if(shouldShowSearch()) {
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
              <bk-cat-select [category]="category()!" selectedItemName="all" [withAll]="true" [readOnly]="false" (changed)="categoryChanged.emit($event)" [showIcons]="shouldShowIcons()" />
            </ion-col>
          }
          @if(showType()) {
            <ion-col size="6" size-md="3">
              <bk-cat-select [category]="type()!" selectedItemName="all" [withAll]="true" [readOnly]="false" (changed)="typeChanged.emit($event)" [showIcons]="shouldShowIcons()" />
            </ion-col>
          }                                                  
          @if(showYear()) {
            <ion-col size="6" size-md="2">
              <bk-year-select [label]="yearLabel()!" (changed)="yearChanged.emit($event)" [readOnly]="false" [showAllYears]="true" />
            </ion-col>
          }
          @if(showState()) {
            <ion-col size="6" size-md="2">
              <bk-cat-select [category]="state()!" selectedItemName="all" [withAll]="true" [readOnly]="false" (changed)="stateChanged.emit($event)" [showIcons]="shouldShowIcons()" />
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
  protected shouldShowSearch = computed(() => coerceBoolean(this.showSearch()));
  public tags = input<string>();
  public category = input<CategoryListModel>();
  public type = input<CategoryListModel>();
  public years = input<number[]>();
  public state = input<CategoryListModel>();
  public showIcons = input(true);
  protected shouldShowIcons = computed(() => coerceBoolean(this.showIcons()));
  public yearLabel = input<string>();

  // name the popups per filter name
  protected catName = computed(() => this.category()?.name);
  protected typeName = computed(() => this.type()?.name);
  protected stateName = computed(() => this.state()?.name);

 // filter definitions
  protected showTags = computed(()     => this.tags() !== undefined);
  protected showCategory = computed(() => this.category() !== undefined);
  protected showType = computed(()     => this.type() !== undefined);
  protected showYear = computed(()     => this.years() !== undefined && this.yearLabel);
  protected showState = computed(()    => this.state() !== undefined && this.stateName);

  // outputs
  public searchTermChanged = output<string>();
  public tagChanged = output<string>();
  public categoryChanged = output<string>();
  public typeChanged = output<string>();
  public yearChanged = output<number>();
  public stateChanged = output<string>();

  protected onSearchTermChange($event: Event): void {
    const searchTerm = ($event.target as HTMLInputElement).value;
    this.searchTermChanged.emit(searchTerm);
  }
}

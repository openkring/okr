import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonGrid, IonIcon, IonRow, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel } from '@bk2/shared-models';
import { coerceBoolean, getYear, getYearList } from '@bk2/shared-util-core';

import { CategorySelectComponent } from './category-select.component';
import { SearchbarComponent } from './searchbar.component';
import { SingleTagComponent } from './single-tag.component';
import { YearSelectComponent } from './year-select.component';
import { SvgIconPipe } from '@bk2/shared-pipes';

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
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SearchbarComponent, SingleTagComponent, CategorySelectComponent, YearSelectComponent,
    IonToolbar, IonGrid, IonRow, IonCol, IonButtons, IonButton, IonIcon
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
      @if(viewType()) {
        <ion-buttons slot="end">
          <ion-button (click)="toggleView()">
            <ion-icon slot="icon-only" src="{{getViewIcon() | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      }
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
  public viewType = input<'calendar' | 'grid' | undefined>();

  public selectedTag = input<string>('');
  public selectedType = input<string>('');
  public selectedCategory = input<string>('');
  public selectedYear = input<number>(getYear());
  public selectedState = input<string>('all');

  public showIcons = input(true);
  public showSearch = input(true);
  public yearLabel = input<string>();

  public viewToggle = false;

  // coerced boolean inputs
  protected shouldShowIcons = computed(() => coerceBoolean(this.showIcons()));

  // name the popups per filter name
  protected catName = computed(() => this.categories()?.name);
  protected typeName = computed(() => this.types()?.name);
  protected stateName = computed(() => this.states()?.name);

 // filter visibility
  protected showTags = computed(()     => this.tags().length > 0);
  protected showType = computed(()     => this.types() !== undefined);
  protected showCategory = computed(() => this.categories() !== undefined);
  protected showYear = computed(()     => this.years() !== undefined);
  protected showState = computed(()    => this.states() !== undefined);
  protected yearList = computed(()     => this.years() ?? getYearList());   // default is last 8 years

  // outputs
  public searchTermChanged = output<string>();
  public tagChanged = output<string>();
  public typeChanged = output<string>();
  public categoryChanged = output<string>();
  public yearChanged = output<number>();
  public stateChanged = output<string>();
  public viewToggleChanged = output<boolean>();

  protected onSearchTermChange($event: Event): void {
    this.searchTermChanged.emit(($event.target as HTMLInputElement).value);
  }

  /**
   * Toggle between two views: 
   * -calendar ->   calendar, list
   * -album ->  album, list
   * The view toggle has a name that is passed from the parent component to set the toggle active.
   * If the view toggle is active, an icon is shown. The icon has two representations: true and false, initially it is false.
   * Internally, the toggle is just a boolean. By default, the view is 'list' (undefined).
   * With each click on the icon, its representaiton is switched and the toggleViewChanged event is emitted.
   * The view representation is up to the parent component. Typically, if toggleViewChanged is signalled true, an alternative view is shown.
   */
  protected toggleView(): void {
    this.viewToggle = !this.viewToggle;
    this.viewToggleChanged.emit(this.viewToggle);
  }

  protected getViewIcon(): string {
    switch (this.viewType()) {
      case 'calendar':
        return this.viewToggle ? 'list' : 'calendar';
      case 'grid':
        return this.viewToggle ? 'list' : 'grid';
      default:
        return '';
    }
  }
}

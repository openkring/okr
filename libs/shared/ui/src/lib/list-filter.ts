import { Component, computed, inject, input, output, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonButtons, IonCol, IonGrid, IonIcon, IonRow, IonToolbar } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { CategoryListModel } from '@okr/shared-models';
import { coerceBoolean, getYear, getYearList, ListFilterName, parseListFilters } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import { TranslatePipe } from '@okr/shared-i18n';

import { CategorySelect } from './category-select';
import { Searchbar } from './searchbar';
import { SingleTag } from './single-tag';
import { YearSelect } from './year-select';
import { StringSelect } from './string-select';

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
 * 7. strings (a string-select)
 *
 * The route's `?filters=` query parameter narrows what is shown, on every list alike:
 *   ?filters=search        only the search field
 *   ?filters=search,tags   the listed filters (search, tags, categories, types, years, states, strings, view)
 *   ?filters=none          no filter row at all
 * Leaving it off keeps whatever the host list feeds with data (see parseListFilters).
 * It is read explicitly via ActivatedRoute, not through withComponentInputBinding(): the router
 * merges {...queryParams, ...params, ...data}, so a route's own `data` would silently win.
 */
@Component({
  selector: 'okr-list-filter',
  standalone: true,
  imports: [
    SvgIconPipe, TranslatePipe, AsyncPipe,
    Searchbar, SingleTag, CategorySelect, YearSelect, StringSelect,
    IonToolbar, IonGrid, IonRow, IonCol, IonButtons, IonButton, IonIcon
  ],
  template: `
    @if(showsAnyFilter()) {
    <ion-toolbar>
      <ion-grid class="ion-no-padding ion-align-items-center">
        <ion-row class="ion-align-items-center">
          @if(showSearchField()) {
            <ion-col [size]="searchSize()" [attr.size-md]="compact() ? null : (mdSize() ?? '3')" class="ion-no-padding">
              <okr-searchbar (ionInput)="onSearchTermChange($event)" placeholder="{{ '@search.label' | translate | async }}" />
            </ion-col>
          }
          @if(showTags()) {
            <ion-col size="6" [attr.size-md]="compact() ? null : (mdSize() ?? '2')" class="ion-no-padding" [class.ion-hide-sm-down]="hideTagsOnMobile()">
              <okr-single-tag [selectedTag]="selectedTag()" (selectedTagChange)="tagChanged.emit($event)" [tags]="tags()" />
            </ion-col>
          }
          @if(showCategory()) {
            <ion-col size="6" [attr.size-md]="compact() ? null : (mdSize() ?? '3')" class="ion-no-padding">
              <okr-cat-select [selectedItemName]="selectedCategory()" (selectedItemNameChange)="categoryChanged.emit($event)" [category]="categories()!" [withAll]="true" [readOnly]="false" [showIcons]="shouldShowIcons()" />
            </ion-col>
          }
          @if(showType()) {
            <ion-col size="6" [attr.size-md]="compact() ? null : (mdSize() ?? '3')" class="ion-no-padding">
              <okr-cat-select [selectedItemName]="selectedType()" (selectedItemNameChange)="typeChanged.emit($event)" [category]="types()!" [withAll]="true" [readOnly]="false" [showIcons]="shouldShowIcons()" />
            </ion-col>
          }
          @if(showYear()) {
            <ion-col size="6" [attr.size-md]="compact() ? null : (mdSize() ?? '2')" class="ion-no-padding">
              <okr-year-select [selectedYear]="selectedYear()" (selectedYearChange)="yearChanged.emit($event)" [years]="yearList()" [label]="yearLabel()!" [readOnly]="false" [showAllYears]="showAllYears()" />
            </ion-col>
          }
          @if(showState()) {
            <ion-col size="6" [attr.size-md]="compact() ? null : (mdSize() ?? '2')" class="ion-no-padding">
              <okr-cat-select [selectedItemName]="selectedState()" (selectedItemNameChange)="stateChanged.emit($event)" [category]="states()!" [withAll]="true" [readOnly]="false" [showIcons]="shouldShowIcons()" />
            </ion-col>
          }
          @if(showStrings()) {
            <ion-col size="6" [attr.size-md]="compact() ? null : (mdSize() ?? '3')" class="ion-no-padding">
              <okr-string-select [i18n]="{ name: stringsName(), label: stringsLabel() }" [selectedString]="selectedString()" (selectedStringChange)="stringsChanged.emit($event)" [stringList]="strings()" [readOnly]="false" />
            </ion-col>
          }
        </ion-row>
      </ion-grid>
      @if(initialView() && isVisible('view')) {
        <ion-buttons slot="end">
          <ion-button (click)="toggleView()">
            <ion-icon slot="icon-only" src="{{getViewIcon() | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      }
    </ion-toolbar>
    }
  `
})
export class ListFilter {
  // optional: okr-list-filter is also used inside modals and CMS sections, where no route may be active
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly queryParamMap = this.route ? toSignal(this.route.queryParamMap) : signal(null);
  private readonly visibleFilters = computed(() => parseListFilters(this.queryParamMap()?.get('filters')));
  protected isVisible(name: ListFilterName): boolean {
    return this.visibleFilters().includes(name);
  }

  // inputs
  // data inputs per filter (optional, if undefined (= not used on the okr-list-filter), the filter is not shown)
  public tags = input<string>('');
  public types = input<CategoryListModel>();
  public categories = input<CategoryListModel>();
  public years = input<number[]>();
  public states = input<CategoryListModel>();
  public gridIcon = input<'calendar' | 'grid' | 'board'>('grid'); // the icon to show for the alternative view
  public initialView = input<'list' | 'grid' | undefined>();
  public strings = input<string[]>([]);
  public stringsName = input<string>('iconSet');
  public stringsLabel = input<string>('');

  public selectedTag = input<string>('');
  public selectedType = input<string>('');
  public selectedCategory = input<string>('');
  public selectedYear = input<number>(getYear());
  public selectedState = input<string>('all');
  public selectedString = input<string>('');

  public showIcons = input(true);
  public showSearch = input(true);
  /** false drops the "all years" entry — for a filter that must always resolve to one year */
  public showAllYears = input(true);
  public yearLabel = input<string>();
  public compact = input(false);
  /** Uniform size-md for every filter column, overriding the per-filter defaults (compact wins). */
  public mdSize = input<number>();
  public hideTagsOnMobile = input(false); // hide the tag filter on small screens (sm and down)

  public isListView = linkedSignal(() => this.initialView() === 'list');

  // coerced boolean inputs
  protected shouldShowIcons = computed(() => coerceBoolean(this.showIcons()));

  // name the popups per filter name
  protected catName = computed(() => this.categories()?.name);
  protected typeName = computed(() => this.types()?.name);
  protected stateName = computed(() => this.states()?.name);

 // filter visibility: the host must feed the filter with data AND the route's ?filters= must not exclude it
  protected showSearchField = computed(() => this.showSearch() && this.isVisible('search'));
  protected showTags = computed(()     => this.tags().length > 0 && this.isVisible('tags'));
  protected showType = computed(()     => this.types() !== undefined && this.isVisible('types'));
  protected showCategory = computed(() => this.categories() !== undefined && this.isVisible('categories'));
  protected showYear = computed(()     => this.years() !== undefined && this.isVisible('years'));
  protected showState = computed(()    => this.states() !== undefined && this.isVisible('states'));
  protected yearList = computed(()     => this.years() ?? getYearList());   // default is last 8 years
  protected showStrings = computed(() => ((this.strings() && this.strings()!.length > 0) ?? false) && this.isVisible('strings'));
  protected showsAnyFilter = computed(() =>
    this.showSearchField() || this.showTags() || this.showType() || this.showCategory() || this.showYear()
    || this.showState() || this.showStrings() || (!!this.initialView() && this.isVisible('view')));
  /** A lone searchbar takes the full row on small screens; next to another filter it keeps its half. */
  protected searchSize = computed(() =>
    this.showTags() || this.showType() || this.showCategory() || this.showYear() || this.showState() || this.showStrings() ? '6' : '12');

  // outputs
  public searchTermChanged = output<string>();
  public tagChanged = output<string>();
  public typeChanged = output<string>();
  public categoryChanged = output<string>();
  public yearChanged = output<number>();
  public stateChanged = output<string>();
  public viewToggleChanged = output<boolean>();
  public stringsChanged = output<string>();

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
    this.isListView.set(!this.isListView());
    this.viewToggleChanged.emit(this.isListView());
  }

  protected getViewIcon(): string {
    return this.isListView() ? this.gridIcon() : 'list';
  }
}

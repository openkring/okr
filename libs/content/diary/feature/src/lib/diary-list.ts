import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import {
  IonAccordion, IonAccordionGroup, IonBadge, IonButton, IonButtons, IonChip, IonContent, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPopover, IonTitle, IonToolbar,
} from '@ionic/angular';

import { Menu } from '@okr/cms-menu-feature';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CategoryItemModel, CategoryListModel, DiaryModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { weatherCodeToIcon, WEATHER_ICON_SET } from '@okr/weather-util';

import {
  diaryStateOf, diaryWeatherLine, formatDiaryDateShort, formatDiaryMonthHeader, hasDiaryWeather, isWideDiaryRange, segmentDiaryGroupsByYear,
  DiaryStateFilter,
} from '@okr/content-diary-util';
import { DiaryRangeSelect } from './diary-range-select';
import { DiaryStore } from './diary.store';

/** The i18n scope carrying the diaryState category labels (see the 'diaryState' block in the five bundles). */
const DIARY_STATE_I18N_SCOPE = '@content/diary/feature';

/**
 * The author's own diary — one entry per day (or month/year aggregate), filterable by year and
 * state. `listId` is `all` for the year range, or an album filter over all years (spec 1.114 §5):
 * `person.<okey>`, `location.<okey>`, `event.<slug>`, `tag.<tag>` or `trip.<okey>` — so a filtered
 * list is linkable. A date filter from «Alben» has no listId and stays in the store.
 */
@Component({
  selector: 'okr-diary-list',
  standalone: true,
  imports: [
    NgTemplateOutlet, SvgIconPipe, Spinner, EmptyList, ListFilter, Menu, DiaryRangeSelect,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover,
    IonContent, IonList, IonItem, IonLabel, IonNote, IonBadge, IonAccordionGroup, IonAccordion, IonChip,
  ],
  providers: [DiaryStore],
  styles: [`
    .preview { opacity: .75; }
    .placeholder ion-label { opacity: .6; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.plural() }}</ion-title>
        @if (store.canWrite()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
              (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content><okr-menu [menuName]="contextMenuName()" [toggleStates]="{ toggleMonthGroups: store.groupByMonth() }" /></ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
      <ion-toolbar>
        <ion-buttons slot="start">
          @if (store.filter()) {
            <ion-chip color="primary" (click)="store.clearFilter()" [attr.aria-label]="store.i18n.albums_filter_clear()">
              <ion-label>{{ store.filterLabel() }}</ion-label>
              <ion-icon src="{{ 'cancel-circle' | svgIcon }}" />
            </ion-chip>
          } @else {
            <okr-diary-range-select [tree]="store.rangeTree()" [selected]="store.selectedRange()"
              [allLabel]="store.i18n.list_all_years()" [label]="store.i18n.list_period()"
              (selectedChange)="store.setSelectedRange($event)" />
          }
        </ion-buttons>
        <okr-list-filter
          (searchTermChanged)="store.setSearchTerm($event)"
          (stateChanged)="onStateChange($event)" [states]="states()" />
      </ion-toolbar>
      @if (isWide() && !store.filter()) {
        <ion-toolbar color="light"><ion-note class="ion-padding-start">{{ store.i18n.list_all_years_hint() }}</ion-note></ion-toolbar>
      }
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        @if (store.groupByMonth()) {
          @for (segment of yearSegments(); track segment.year) {
            @if (segment.yearGroup; as yearGroup) {
              <ion-list lines="inset">
                @for (diary of yearGroup.items; track diary.okey) {
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: diary }" />
                }
              </ion-list>
            }
            @if (segment.months.length) {
              <ion-accordion-group [multiple]="true" [value]="segment.monthKeys">
                @for (group of segment.months; track group.key) {
                  <ion-accordion [value]="group.key">
                    <ion-item slot="header" color="light">
                      <ion-label>{{ monthHeader(group.key) }} ({{ group.items.length }})</ion-label>
                    </ion-item>
                    <ion-list slot="content" lines="inset">
                      @for (diary of group.items; track diary.okey) {
                        <ng-container *ngTemplateOutlet="row; context: { $implicit: diary }" />
                      }
                    </ion-list>
                  </ion-accordion>
                }
              </ion-accordion-group>
            }
          }
        } @else {
          <ion-list lines="inset">
            @for (diary of store.filteredDiaries(); track diary.okey) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: diary }" />
            }
          </ion-list>
        }
      }
    </ion-content>

    <ng-template #row let-diary>
      <ion-item button [detail]="false" (click)="store.view(diary)" [class.placeholder]="stateOf(diary) === 'placeholder'">
        @if (diary.scope === 'day' && hasWeather(diary)) {
          <ion-icon slot="start" src="{{ weatherIcon(diary) | svgIcon: weatherIconSet }}" />
        } @else if (stateOf(diary) === 'placeholder') {
          <ion-icon slot="start" src="{{ 'image' | svgIcon }}" />
        } @else {
          <ion-icon slot="start" src="{{ 'document' | svgIcon }}" />
        }
        <ion-label>
          <h2>{{ formatDate(diary.date) }} {{ diary.title }}</h2>
          @if (stateOf(diary) !== 'placeholder') {
            <p class="preview">{{ preview(diary) }}</p>
          }
        </ion-label>
        @if (diary.scope !== 'day') {
          <ion-badge slot="end" color="medium">{{ diary.scope === 'month' ? store.i18n.scope_month() : store.i18n.scope_year() }}</ion-badge>
        }
        @if (stateOf(diary) === 'draft') {
          <ion-badge slot="end" color="warning">{{ store.i18n.state_draft() }}</ion-badge>
        }
        <ion-note slot="end" class="ion-hide-sm-down">{{ diary.location?.label || diary.location?.name1 || diary.customLocationLabel }}</ion-note>
      </ion-item>
    </ng-template>
  `,
})
export class DiaryList {
  protected readonly store = inject(DiaryStore);
  private readonly alertService = inject(AlertService);

  public readonly listId = input('all');
  public readonly contextMenuName = input.required<string>();

  constructor() {
    // Ionic creates a new list per URL, so the route segments are read once per instance
    effect(() => {
      const listId = this.listId();
      const contextMenuName = this.contextMenuName();
      untracked(() => this.store.initFromRoute(listId, contextMenuName));
    });
  }

  protected readonly count = computed(() => this.store.diaries().length);
  protected readonly filteredCount = computed(() => this.store.filteredDiaries().length);
  protected readonly popupId = computed(() => `c_diaries_${this.listId()}`);
  protected readonly isWide = computed(() => isWideDiaryRange(this.store.selectedRange()));
  /**
   * One block per year: its aggregate above its own month accordions. `monthKeys` opens every
   * month; it is computed here, not in the template, so `[value]` only changes with the data.
   */
  protected readonly yearSegments = computed(() => segmentDiaryGroupsByYear(this.store.groupedDiaries())
    .map(segment => ({ ...segment, monthKeys: segment.months.map(g => g.key) })));
  protected readonly stateOf = diaryStateOf;
  protected readonly hasWeather = (d: DiaryModel) => hasDiaryWeather(d.weather);
  protected readonly weatherIcon = (d: DiaryModel) => weatherCodeToIcon(d.weather.code);
  protected readonly weatherIconSet = WEATHER_ICON_SET;

  /**
   * The state filter as a category list, the shape okr-list-filter/okr-cat-select expects for
   * `[states]`. `withAll` (hardcoded true on okr-list-filter) prepends the 'all' item itself, so
   * only the three real states are listed here. Item `name` is the actual filter VALUE
   * (DiaryStateFilter) — it is what `(stateChanged)` emits and must never be a translated label.
   * Labels come from the 'diaryState' i18n block via translateItems/getItemLabel, the same
   * pattern as `getExpenseTransferCategory`.
   */
  protected readonly states = computed((): CategoryListModel => {
    const category = new CategoryListModel(this.store.tenantId());
    category.name = 'diaryState';
    category.i18n = DIARY_STATE_I18N_SCOPE;
    category.translateItems = true;
    category.items = (['final', 'draft', 'placeholder'] as const).map(name => new CategoryItemModel(name, ''));
    return category;
  });

  protected formatDate(date: string): string {
    return formatDiaryDateShort(date, this.store.lang());
  }

  protected monthHeader(key: string): string {
    return formatDiaryMonthHeader(key, this.store.lang());
  }

  protected preview(diary: DiaryModel): string {
    const line = (diary.text ?? '').replace(/<[^>]+>/g, '').replace(/[#*_>`]/g, '').trim().split('\n').find(l => l.trim())?.trim() ?? '';
    const weather = diary.scope === 'day' ? diaryWeatherLine(diary.weather) : '';
    return [weather, line].filter(Boolean).join(' · ').slice(0, 140);
  }

  protected onStateChange(state: string): void {
    this.store.setSelectedState(state as DiaryStateFilter);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    switch ($event.detail.data) {
      case 'add': await this.store.add(); break;
      case 'albums': await this.store.openAlbums(); break;
      case 'toggleMonthGroups': this.store.toggleGroupByMonth(); break;
      case undefined: case null: break;
      default: this.alertService.error(`DiaryList.onPopoverDismiss: unknown method ${$event.detail.data}`);
    }
  }
}

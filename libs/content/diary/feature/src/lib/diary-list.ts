import { Component, computed, inject, input } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonMenuButton, IonNote, IonPopover, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CategoryItemModel, CategoryListModel, DiaryModel } from '@okr/shared-models';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { weatherCodeToIcon, WEATHER_ICON_SET } from '@okr/weather-util';

import { diaryStateOf, diaryWeatherLine, formatDiaryDate, hasDiaryWeather, DiaryStateFilter } from '@okr/content-diary-util';
import { DiaryStore } from './diary.store';

/** The i18n scope carrying the diaryState category labels (see the 'diaryState' block in the five bundles). */
const DIARY_STATE_I18N_SCOPE = '@content/diary/feature';

/**
 * The author's own diary — one entry per day (or month/year aggregate), filterable by year and
 * state. `listId` is a reserved partition hook (e.g. by trip) for a later task; it does nothing
 * yet.
 */
@Component({
  selector: 'okr-diary-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover,
    IonContent, IonList, IonItem, IonLabel, IonNote, IonBadge,
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
                <ion-content><okr-menu [menuName]="contextMenuName()" /></ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
      <ion-toolbar>
        <okr-list-filter
          (searchTermChanged)="store.setSearchTerm($event)"
          (yearChanged)="store.setSelectedYear($event)" [years]="store.years()" [showAllYears]="true"
          (stateChanged)="onStateChange($event)" [states]="states()" />
      </ion-toolbar>
      @if (store.selectedYear() === undefined) {
        <ion-toolbar color="light"><ion-note class="ion-padding-start">{{ store.i18n.list_all_years_hint() }}</ion-note></ion-toolbar>
      }
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (diary of store.filteredDiaries(); track diary.okey) {
            <ion-item button [detail]="false" (click)="showActions(diary)" [class.placeholder]="stateOf(diary) === 'placeholder'">
              @if (diary.scope === 'day' && hasWeather(diary)) {
                <ion-icon slot="start" src="{{ weatherIcon(diary) | svgIcon: weatherIconSet }}" />
              } @else if (stateOf(diary) === 'placeholder') {
                <ion-icon slot="start" src="{{ 'image' | svgIcon }}" />
              } @else {
                <ion-icon slot="start" src="{{ 'document' | svgIcon }}" />
              }
              <ion-label>
                <h2>{{ formatDiaryDate(diary.date) }} {{ diary.title }}</h2>
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
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class DiaryList {
  protected readonly store = inject(DiaryStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly listId = input('all');
  public readonly contextMenuName = input.required<string>();

  protected readonly count = computed(() => this.store.diaries().length);
  protected readonly filteredCount = computed(() => this.store.filteredDiaries().length);
  protected readonly popupId = computed(() => `c_diaries_${this.listId()}`);
  protected readonly formatDiaryDate = formatDiaryDate;
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
   * pattern as `getExpenseStateCategory`.
   */
  protected readonly states = computed((): CategoryListModel => {
    const category = new CategoryListModel(this.store.tenantId());
    category.name = 'diaryState';
    category.i18n = DIARY_STATE_I18N_SCOPE;
    category.translateItems = true;
    category.items = (['final', 'draft', 'placeholder'] as const).map(name => new CategoryItemModel(name, ''));
    return category;
  });

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
      case undefined: case null: break;
      default: this.alertService.error(`DiaryList.onPopoverDismiss: unknown method ${$event.detail.data}`);
    }
  }

  protected async showActions(diary: DiaryModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, diary);
    await this.executeActions(options, diary);
  }

  private addActionSheetButtons(options: ActionSheetOptions, diary: DiaryModel): void {
    options.buttons.push(createActionSheetButton('diary.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    options.buttons.push(createActionSheetButton('diary.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetDivider());
    if (diary.scope === 'day' && !hasDiaryWeather(diary.weather) && diary.location?.key) {
      options.buttons.push(createActionSheetButton('diary.weather', this.store.i18n.weather_refresh(), this.imgixBaseUrl, 'reload'));
    }
    if (diary.driveFolderId) {
      options.buttons.push(createActionSheetButton('diary.drive', this.store.i18n.open_drive(), this.imgixBaseUrl, 'image'));
    }
    options.buttons.push(createActionSheetButton('diary.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, diary: DiaryModel): Promise<void> {
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    switch (data?.action) {
      case 'diary.view':    await this.store.view(diary); break;
      case 'diary.edit':    await this.store.edit(diary); break;
      case 'diary.weather': await this.store.refreshWeather(diary); break;
      case 'diary.drive':   await this.store.openDrive(diary); break;
      case 'diary.delete':  await this.store.delete(diary); break;
    }
  }
}

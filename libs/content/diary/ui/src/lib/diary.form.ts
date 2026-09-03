import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import {
  IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';

import { AvatarInfo, DiaryModel, DiaryScope, DiaryStatus, RoleName, TripModel, UserModel } from '@okr/shared-models';
import {
  Chips, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n,
  TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { DEFAULT_TAGS } from '@okr/shared-constants';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Avatars } from '@okr/avatar-ui';

import {
  DiaryI18n, composeDiaryDate, csvToList, diaryValidations, linesToList, listToCsv, listToLines, splitDiaryDate,
} from '@okr/content-diary-util';

@Component({
  selector: 'okr-diary-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, DateInput, NumberInput, Chips, ErrorNote, Avatars, SvgIconPipe,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonIcon, IonSelect, IonSelectOption,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <!-- the text first: on a phone this is the field that matters -->
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="textI18n()" [value]="text()" (valueChange)="onFieldChange('text', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="100" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-select [label]="i18n().form_scope_label()" [value]="scope()" interface="popover"
                      [disabled]="isReadOnly() || lockDate()" (ionChange)="onScopeChange($event.detail.value)">
                      <ion-select-option value="day">{{ i18n().scope_day() }}</ion-select-option>
                      <ion-select-option value="month">{{ i18n().scope_month() }}</ion-select-option>
                      <ion-select-option value="year">{{ i18n().scope_year() }}</ion-select-option>
                    </ion-select>
                  </ion-item>
                </ion-col>
              </ion-row>

              <!-- the date is composed per scope, never typed as a zeroed string -->
              <ion-row>
                @if (scope() === 'day') {
                  <ion-col size="12" size-md="6">
                    <okr-date-input [i18n]="dateI18n()" [storeDate]="date()" (storeDateChange)="onDayChange($event)"
                      [readOnly]="isReadOnly() || lockDate()" [showDateSelect]="true" />
                  </ion-col>
                } @else {
                  <ion-col size="6" size-md="3">
                    <okr-number-input [i18n]="yearI18n()" [value]="year()" (valueChange)="onYearChange($event)"
                      [readOnly]="isReadOnly() || lockDate()" [min]="1000" [max]="9999" [integer]="true" />
                  </ion-col>
                  @if (scope() === 'month') {
                    <ion-col size="6" size-md="3">
                      <okr-number-input [i18n]="monthI18n()" [value]="month()" (valueChange)="onMonthChange($event)"
                        [readOnly]="isReadOnly() || lockDate()" [min]="1" [max]="12" [integer]="true" />
                    </ion-col>
                  }
                }
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-select [label]="i18n().form_status_label()" [value]="status()" interface="popover"
                      [disabled]="isReadOnly()" (ionChange)="onFieldChange('status', $event.detail.value)">
                      <ion-select-option value="draft">{{ i18n().state_draft() }}</ion-select-option>
                      <ion-select-option value="final">{{ i18n().state_final() }}</ion-select-option>
                    </ion-select>
                  </ion-item>
                </ion-col>
              </ion-row>
              <okr-error-note [errors]="dateErrors()" />

              <!-- location: resolved avatar OR free text, the TripModel hybrid -->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().form_location_label() }}</ion-label>
                    @if (formData().location; as location) {
                      <ion-label slot="end">{{ location.label || location.name1 }}</ion-label>
                      @if (!isReadOnly()) {
                        <ion-icon slot="end" src="{{ 'cancel-circle' | svgIcon }}" (click)="clearLocation()" />
                      }
                    } @else if (!isReadOnly()) {
                      <ion-icon slot="end" src="{{ 'location' | svgIcon }}" (click)="locationSelectClicked.emit()" />
                    }
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  @if (!formData().location) {
                    <okr-text-input [i18n]="customLocationI18n()" [value]="customLocationLabel()"
                      (valueChange)="onFieldChange('customLocationLabel', $event)" [maxLength]="100" [readOnly]="isReadOnly()" />
                  }
                </ion-col>
              </ion-row>

              <!-- trip: a plain select over the tenant's travel trips -->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-select [label]="i18n().form_trip_label()" [value]="tripKey()" interface="popover"
                      [disabled]="isReadOnly()" (ionChange)="onFieldChange('tripKey', $event.detail.value)">
                      <ion-select-option value="">{{ i18n().form_trip_none() }}</ion-select-option>
                      @for (trip of travelTrips(); track trip.okey) {
                        <ion-select-option [value]="trip.okey">{{ trip.name }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-item>
                </ion-col>
              </ion-row>

              <!-- slug vocabularies, comma separated -->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="eventsI18n()" [value]="events()" (valueChange)="onFieldChange('events', csvToList($event))"
                    [maxLength]="200" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="placesI18n()" [value]="places()" (valueChange)="onFieldChange('places', csvToList($event))"
                    [maxLength]="200" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="customPeopleI18n()" [value]="customPeople()"
                    (valueChange)="onFieldChange('customPeopleLabels', csvToList($event))" [maxLength]="500" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>

              <!-- done: one line per item -->
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="doneI18n()" [value]="done()" (valueChange)="onFieldChange('done', linesToList($event))"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- resolved people -->
        @if (currentUser(); as currentUser) {
          <okr-avatars (selectClicked)="personSelectClicked.emit()" [avatars]="people()"
            (avatarsChange)="onFieldChange('people', $event)" [readOnly]="isReadOnly()" [currentUser]="currentUser"
            [title]="i18n().form_people_label()" [label]="i18n().form_people_select()" [showButton]="!isReadOnly()" />
        }

        <!-- guarded, last -->
        @if (hasRole('admin')) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)"
            [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class DiaryForm {
  public readonly i18n = input.required<DiaryI18n>();
  public formData = model.required<DiaryModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  /** Edit mode: scope and date/year/month are locked — changing the date is delete + create, not an edit. */
  public readonly lockDate = input(false);
  public readonly showForm = input(true);
  public readonly travelTrips = input<TripModel[]>([]);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly locationSelectClicked = output<void>();
  public readonly personSelectClicked = output<void>();

  // signal form — wraps formData with Vest validation
  protected readonly diaryForm = form(this.formData, (path) => validateVestTree(path, diaryValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.diaryForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly text = computed(() => this.formData()?.text ?? '');
  protected readonly scope = computed((): DiaryScope => this.formData()?.scope ?? 'day');
  protected readonly status = computed((): DiaryStatus => this.formData()?.status ?? 'draft');
  protected readonly date = computed(() => this.formData()?.date ?? '');
  protected readonly year = computed(() => splitDiaryDate(this.date())?.year ?? 0);
  protected readonly month = computed(() => splitDiaryDate(this.date())?.month ?? 0);
  protected readonly customLocationLabel = computed(() => this.formData()?.customLocationLabel ?? '');
  protected readonly tripKey = computed(() => this.formData()?.tripKey ?? '');
  protected readonly events = computed(() => listToCsv(this.formData()?.events ?? []));
  protected readonly places = computed(() => listToCsv(this.formData()?.places ?? []));
  protected readonly customPeople = computed(() => listToCsv(this.formData()?.customPeopleLabels ?? []));
  protected readonly done = computed(() => listToLines(this.formData()?.done ?? []));
  protected readonly people = computed(() => this.formData()?.people ?? []);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);

  // per-field Vest errors are read from a direct suite call (menu.form.ts/alias.form.ts pattern) —
  // the Signal Form wrapper above drives overall validity, not per-field error text.
  private readonly validationResult = computed(() =>
    diaryValidations(this.formData(), (this.tenantId() ?? '') as string, (this.allTags() ?? '') as string),
  );
  protected readonly dateErrors = computed(() => this.validationResult().getErrors('date'));

  protected readonly csvToList = csvToList;
  protected readonly linesToList = linesToList;

  protected textI18n = computed(() => ({ name: 'text', label: this.i18n().form_text_label(), placeholder: this.i18n().form_text_placeholder() } as NotesInputI18n));
  protected doneI18n = computed(() => ({ name: 'done', label: this.i18n().form_done_label(), placeholder: this.i18n().form_done_placeholder() } as NotesInputI18n));
  protected titleI18n = computed(() => ({ name: 'title', label: this.i18n().form_title_label(), placeholder: this.i18n().form_title_placeholder(), helper: '' } as TextInputI18n));
  protected dateI18n = computed(() => ({ name: 'date', label: this.i18n().form_date_label(), placeholder: '' } as DateInputI18n));
  protected yearI18n = computed(() => ({ name: 'year', label: this.i18n().form_year_label(), placeholder: '', helper: '' } as NumberInputI18n));
  protected monthI18n = computed(() => ({ name: 'month', label: this.i18n().form_month_label(), placeholder: '', helper: '' } as NumberInputI18n));
  protected customLocationI18n = computed(() => ({ name: 'customLocationLabel', label: this.i18n().form_location_label(), placeholder: this.i18n().form_location_select(), helper: '' } as TextInputI18n));
  protected eventsI18n = computed(() => ({ name: 'events', label: this.i18n().form_events_label(), placeholder: '', helper: '' } as TextInputI18n));
  protected placesI18n = computed(() => ({ name: 'places', label: this.i18n().form_places_label(), placeholder: '', helper: '' } as TextInputI18n));
  protected customPeopleI18n = computed(() => ({ name: 'customPeopleLabels', label: this.i18n().form_custom_people_label(), placeholder: '', helper: this.i18n().form_custom_people_helper() } as TextInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | AvatarInfo[] | AvatarInfo | undefined): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** A scope change re-composes the date so it can never contradict the scope. */
  protected onScopeChange(scope: DiaryScope): void {
    const parts = splitDiaryDate(this.date()) ?? { year: new Date().getFullYear(), month: 1, day: 1 };
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm, scope,
      date: composeDiaryDate(scope, parts.year, parts.month || 1, parts.day || 1),
    }));
  }

  protected onDayChange(storeDate: string): void {
    this.onFieldChange('date', storeDate);
  }

  protected onYearChange(year: number): void {
    this.onFieldChange('date', composeDiaryDate(this.scope(), year, this.month()));
  }

  protected onMonthChange(month: number): void {
    this.onFieldChange('date', composeDiaryDate('month', this.year(), month));
  }

  protected clearLocation(): void {
    this.onFieldChange('location', undefined);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

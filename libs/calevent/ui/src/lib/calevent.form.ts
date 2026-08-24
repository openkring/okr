import { Component, computed, effect, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonList, IonNote, IonRow } from '@ionic/angular/standalone';

import { ChFutureDate, LowercaseWordMask } from '@okr/shared-config';
import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TIME, DEFAULT_URL, NAME_LENGTH } from '@okr/shared-constants';
import { AvatarInfo, CalEventModel, CategoryListModel, LocationModel, RoleName, UserModel } from '@okr/shared-models';
import { CategorySelect, Checkbox, CheckboxI18n, Chips, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringList, TextInput, TextInputI18n, TimeInput, TimeInputI18n, UrlInput, UrlInputI18n } from '@okr/shared-ui';
import { coerceBoolean, extractFirstPartOfOptionalTupel, hasRole } from '@okr/shared-util-core';
import { ModelSelectService } from '@okr/shared-feature';

import { Avatars } from '@okr/avatar-ui';
import { CaleventI18n, calEventValidations, isPersonalCalevent } from '@okr/calevent-util';

const MAX_LOCATION_SUGGESTIONS = 8;

@Component({
  selector: 'okr-calevent-form',
  standalone: true,
  imports: [
    CategorySelect, Chips, NotesInput, DateInput, TimeInput, NumberInput,
    TextInput, ErrorNote, StringList, Avatars, Checkbox, UrlInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonList, IonItem, IonLabel, IonNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-note.poll-series { display: block; padding: 0 16px 8px; font-size: 12px; }
  `],
  template: `
  @if (showForm()) {
  <form novalidate>

    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          @if(expertMode()) {
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="okeyI18n()" [value]="okey()" [readOnly]="true" [copyable]="true" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="seriesIdI18n()" [value]="seriesId()" [readOnly]="true" [copyable]="true" />
              </ion-col>
            </ion-row>
          }
            <ion-row>
              <ion-col size="12">
                <okr-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false"  [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="nameErrors()" />
              </ion-col>
            </ion-row>
            <!-- personal events support a reduced feature set: no fullDay, no series, no location, no url -->
            @if(!isPersonal()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="fullDayI18n()" [checked]="fullDay()" (checkedChange)="onFullDayChange($event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
            @if(!fullDay()) {
              <ion-row>
                <ion-col size="12" size-md="6" size-lg="4">
                  <okr-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6" size-lg="4">
                  <okr-time-input [i18n]="startTimeI18n()" [value]="startTime()" (valueChange)="onFieldChange('startTime', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6" size-lg="4">
                  <okr-number-input [i18n]="durationMinutesI18n()" [value]="durationMinutes()" (valueChange)="onFieldChange('durationMinutes', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            } @else {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="endDateI18n()" [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
            @if(!isPersonal()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="periodicities()!" [selectedItemName]="periodicity()" (selectedItemNameChange)="onFieldChange('periodicity', $event)" [readOnly]="isReadOnly() || isPollSeries()" [withAll]="false" />
                  @if (isPollSeries()) { <ion-note class="poll-series">{{ i18n().poll_series_helper() }}</ion-note> }
                </ion-col>
                @if(isRecurring()) {
                  <ion-col size="12" size-md="6">
                    <okr-date-input [i18n]="repeatUntilDateI18n()" [storeDate]="repeatUntilDate()" (storeDateChange)="onFieldChange('repeatUntilDate', $event)" [locale]="locale()" [mask]="chFutureDate" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="repeatUntilDateErrors()" />
                  </ion-col>
                }
              </ion-row>
            }
            @if(expertMode() && !isPersonal()) {
              <ion-row>
                <ion-col size="12">
                  <!-- typing filters the known locations; picking one stores 'name@okey',
                       otherwise the typed text is kept as a free-text location -->
                  <okr-text-input [i18n]="locationKeyI18n()" [value]="locationLabel()" (valueChange)="onLocationInput($event)" [readOnly]="isReadOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="locationKeyErrors()" />
                  @if(locationSuggestions().length > 0) {
                    <ion-list lines="inset">
                      @for(loc of locationSuggestions(); track loc.okey) {
                        <ion-item button (click)="selectLocation(loc)">
                          <ion-label>{{ loc.name }}</ion-label>
                        </ion-item>
                      }
                    </ion-list>
                  }
                </ion-col>
              </ion-row>
            }
            @if(!isPersonal()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-url [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="urlLabelI18n()" [value]="urlLabel()" (valueChange)="onFieldChange('urlLabel', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(currentUser(); as currentUser) {
      <!-- the organiser is the creator; only eventAdmin/privileged (and never on a personal event) may change it -->
      <okr-avatars name="responsiblePersons"
        [avatars]="responsiblePersons()" (avatarsChange)="onFieldChange('responsiblePersons', $event)"
        (selectClicked)="selectPerson()"
        [currentUser]="currentUser"
        [readOnly]="isReadOnly() || isPersonal() || !expertMode()"
        [title]="i18n().responsible()"
        [description]="i18n().responsible_description()"
      />
    }

    <!-- calendars, tags and notes are internal organisation data: not shown to plain registered users -->
    @if(expertMode() && !isPersonal()) {
    <okr-strings
      [strings]="calendars()"
      (stringsChange)="onFieldChange('calendars', $event)"
      [mask]="calendarMask"
      [maxLength]="nameLength"
      [readOnly]="isReadOnly()"
      inputStyle="select" (selectClicked)="calendarSelectClicked.emit()"
      [title]="i18n().calendar_title()"
      [add]="i18n().calendar_add()"
      [selectLabel]="i18n().calendar_select()"
    />
    }

  <!---------------------------------------------------
    TAG, NOTES
    --------------------------------------------------->
    @if(expertMode() && !isPersonal()) {
      <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      <okr-error-note [errors]="tagsErrors()" />
    }

    @if(hasRole('admin') && !isPersonal()) {
      <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
    }

    <!-- Catch-all. A field this form does not render (or that a plain registered user cannot see)
         can still fail validation, and the only symptom is the missing change-confirmation bar.
         Surfacing it here turns a silent dead end into a readable message. -->
    <okr-error-note [errors]="unrenderedErrors()" />
  </form>
  }
`
})
export class CalEventForm {
  private readonly modelSelectService = inject(ModelSelectService);

  // inputs
  public readonly i18n = input.required<CaleventI18n>();
  public formData = model.required<CalEventModel>();
  public readonly currentUser = input.required<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readonly locale = input.required<string>();
  /** known locations of the tenant, offered as suggestions for the location field */
  public readonly locations = input<LocationModel[]>([]);
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public calendarSelectClicked = output<void>();

  constructor() { effect(() => this.valid.emit(this.validationResult().isValid())); }

  // validation and errors
  private readonly validationResult = computed(() => calEventValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected repeatUntilDateErrors = computed(() => this.validationResult().getErrors('repeatUntilDate'));
  protected locationKeyErrors = computed(() => this.validationResult().getErrors('locationKey'));
  // stringArrayValidations files a bad tag under 'tags[0]', not 'tags' — collect both
  protected tagsErrors = computed(() => this.errorsFor('tags'));
  /**
   * The fields that currently show their own okr-error-note. Computed, not a constant: whether
   * location/tags are on screen depends on expertMode, so a registered user's hidden tag error
   * must still reach the catch-all note.
   */
  private readonly fieldsWithOwnErrorNote = computed(() => {
    const fields = ['name'];
    if (!this.isPersonal() && this.isRecurring()) fields.push('repeatUntilDate');
    if (this.expertMode() && !this.isPersonal()) fields.push('locationKey', 'tags');
    return fields;
  });
  protected unrenderedErrors = computed(() => {
    const shown = this.fieldsWithOwnErrorNote();
    const all = this.validationResult().getErrors() as Record<string, string[]>;
    return Object.entries(all)
      .filter(([field]) => !shown.some(f => this.matchesField(field, f)))
      .flatMap(([, errors]) => errors);
  });

  /** Vest indexes array-item failures as 'tags[0]'; treat those as belonging to 'tags'. */
  private matchesField(errorField: string, field: string): boolean {
    return errorField === field || errorField.startsWith(`${field}[`);
  }

  private errorsFor(field: string): string[] {
    const all = this.validationResult().getErrors() as Record<string, string[]>;
    return Object.entries(all)
      .filter(([errorField]) => this.matchesField(errorField, field))
      .flatMap(([, errors]) => errors);
  }

  // fields
  protected okey = linkedSignal(() => this.formData().okey ?? '');
  protected seriesId = linkedSignal(() => this.formData().seriesId ?? '');
  protected type = linkedSignal(() => this.formData().type ?? DEFAULT_CALEVENT_TYPE);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected fullDay = linkedSignal(() => this.formData().fullDay ?? false);
  protected startDate = linkedSignal(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = linkedSignal(() => this.formData().startTime ?? DEFAULT_TIME);
  protected endDate = linkedSignal(() => this.formData().endDate ?? this.startDate());
  protected durationMinutes = linkedSignal(() => this.formData().durationMinutes);
  protected periodicity = linkedSignal(() => this.formData().periodicity ?? DEFAULT_PERIODICITY);
  protected isRecurring = computed(() => this.periodicity() && this.periodicity() !== 'once');
  /**
   * A poll-born series: the organizer confirmed several dates of a Terminumfrage. Those dates are
   * irregular, so no periodicity describes them — turning it into a rule-based series would let
   * planSeriesReconcile archive every sibling date as surplus. The field is locked here; the Vest
   * suite (caleventPollSeriesPeriodicityLocked) and the store are the backstops.
   */
  protected isPollSeries = computed(() => this.formData().pollMultiSelect === true);
  protected repeatUntilDate = linkedSignal(() => this.formData().repeatUntilDate ?? DEFAULT_DATE);
  protected url = linkedSignal(() => this.formData().url ?? DEFAULT_URL);
  protected urlLabel = linkedSignal(() => this.formData().urlLabel ?? DEFAULT_LABEL);
  protected locationKey = linkedSignal(() => this.formData().locationKey ?? DEFAULT_KEY);
  // the field shows the readable part of 'name@okey' (or the free text if no location was picked)
  protected locationLabel = linkedSignal(() => extractFirstPartOfOptionalTupel(this.formData().locationKey ?? '', '@'));
  private locationSuggestOpen = signal(false);
  protected locationSuggestions = computed(() => {
    if (!this.locationSuggestOpen()) return [];
    const term = this.locationLabel().trim().toLowerCase();
    if (term.length === 0) return [];
    return this.locations().filter(loc => loc.name.toLowerCase().includes(term)).slice(0, MAX_LOCATION_SUGGESTIONS);
  });
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected description = linkedSignal(() => this.formData().description ?? DEFAULT_NOTES);
  protected calendars = linkedSignal(() => this.formData().calendars ?? DEFAULT_CALENDARS);
  protected responsiblePersons = linkedSignal(() => {
  const raw = this.formData().responsiblePersons ?? [];
  return raw.map(p => ({
    key: p.key ?? '',
    label: p.label ?? p.name1 ?? '',
    modelType: p.modelType ?? 'person',
    name1: p.name1 ?? '',
    name2: p.name2 ?? ''
  } as AvatarInfo));
});
  // same rule as CaleventList.canChange(): whoever may edit an event may also see its
  // location, calendars and tags — gating these on 'admin' hid them from eventAdmin/privileged editors
  protected expertMode = computed(() => this.hasRole('eventAdmin') || this.hasRole('privileged'));
  /** A personal event (no calendar) supports a reduced feature set — see isPersonalCalevent(). */
  protected isPersonal = computed(() => isPersonalCalevent(this.formData()));

  // passing constants to template
  protected chFutureDate = ChFutureDate;
  protected calendarMask = LowercaseWordMask;
  protected nameLength = NAME_LENGTH;

  protected okeyI18n = computed(() => ({
    name: 'okey',
    label: this.i18n().okey_label(),
    placeholder: this.i18n().okey_placeholder(),
    helper: this.i18n().okey_helper()
  } as TextInputI18n));

  protected seriesIdI18n = computed(() => ({
    name: 'seriesId',
    label: this.i18n().seriesId_label(),
    placeholder: this.i18n().seriesId_placeholder(),
    helper: this.i18n().seriesId_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected urlI18n = computed(() => ({
    name: 'url',
    label: this.i18n().url(),
    placeholder: this.i18n().url_placeholder(),
    helper: this.i18n().url_helper()
  } as UrlInputI18n));

  protected urlLabelI18n = computed(() => ({
    name: 'urlLabel',
    label: this.i18n().urlLabel_label(),
    placeholder: this.i18n().urlLabel_placeholder(),
    helper: this.i18n().urlLabel_helper()
  } as TextInputI18n));

  protected locationKeyI18n = computed(() => ({
    name: 'locationKey',
    label: this.i18n().locationKey_label(),
    placeholder: this.i18n().locationKey_placeholder(),
    helper: this.i18n().locationKey_helper()
  } as TextInputI18n));

  protected durationMinutesI18n = computed(() => ({
    name: 'durationMinutes',
    label: this.i18n().durationMinutes(),
    placeholder: this.i18n().durationMinutes_placeholder(),
    helper: this.i18n().durationMinutes_helper()
  } as NumberInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description', label: this.i18n().description(), placeholder: this.i18n().description_placeholder()
  } as NotesInputI18n));

  protected startDateI18n = computed(() => ({
    name: 'startDate',
    label: this.i18n().date_start(),
    placeholder: this.i18n().date_start_placeholder(),
    helper: this.i18n().date_start_helper()
  } as DateInputI18n));

  protected endDateI18n = computed(() => ({
    name: 'endDate',
    label: this.i18n().date_end(),
    placeholder: this.i18n().date_end_placeholder(),
    helper: this.i18n().date_end_helper()
  } as DateInputI18n));

  protected repeatUntilDateI18n = computed(() => ({
    name: 'repeatUntilDate',
    label: this.i18n().date_repeatUntil_label(),
    placeholder: this.i18n().date_repeatUntil_placeholder(),
    helper: this.i18n().date_repeatUntil_helper()
  } as DateInputI18n));

  protected startTimeI18n = computed(() => ({
    name: 'startTime',
    label: this.i18n().startTime_label(),
    placeholder: this.i18n().startTime_placeholder(),
  } as TimeInputI18n));

  protected fullDayI18n = computed(() => ({
    name: 'fullDay',
    label: this.i18n().fullDay_label(),
    helper: this.i18n().fullDay_helper(),
  } as CheckboxI18n));

  /******************************* actions *************************************** */
  public async selectPerson(): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar('', DEFAULT_LABEL);
    if (avatar) {
        const responsiblePersons = this.responsiblePersons();
        responsiblePersons.push(avatar);
        this.onFieldChange('responsiblePersons', responsiblePersons);
    }
  }

  protected onFullDayChange(isFullDay: boolean): void {
    if (isFullDay) {
      this.formData.update(vm => ({
        ...vm,
        fullDay: true,
        durationMinutes: 1440,
        startTime: ''
      }));
    } else {
      this.formData.update(vm => ({
        ...vm,
        fullDay: false,
        endDate: vm.startDate
      }));
    }
    this.dirty.emit(true);
  }

  /** free text: kept as-is, so an unknown location stays a plain label */
  protected onLocationInput(value: string): void {
    this.locationLabel.set(value);
    this.locationSuggestOpen.set(true);
    this.onFieldChange('locationKey', value);
  }

  protected selectLocation(location: LocationModel): void {
    this.locationSuggestOpen.set(false);
    this.locationLabel.set(location.name);
    this.onFieldChange('locationKey', `${location.name}@${location.okey}`);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean | AvatarInfo[]): void {
    this.dirty.emit(true);
    switch(fieldName) {
      case 'responsiblePersons':
        this.formData.update(vm => ({ ...vm, responsiblePersons: fieldValue as AvatarInfo[] }));
        break;
      case 'calendars':
        this.formData.update(vm => ({ ...vm, calendars: fieldValue as string[] }));
        break;
      default:
        this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

import { Component, computed, effect, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow } from '@ionic/angular/standalone';

import { ChFutureDate, LowercaseWordMask } from '@okr/shared-config';
import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TIME, DEFAULT_URL, NAME_LENGTH } from '@okr/shared-constants';
import { AvatarInfo, CalEventModel, CategoryListModel, LocationModel, RoleName, UserModel } from '@okr/shared-models';
import { AddChip, CategorySelect, Checkbox, CheckboxI18n, Chips, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringList, TextInput, TextInputI18n, TimeInput, TimeInputI18n, UrlInput, UrlInputI18n } from '@okr/shared-ui';
import { calculateRecurringDates, coerceBoolean, convertDateFormatToString, DateFormat, extractFirstPartOfOptionalTupel, fill, hasRole } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ModelSelectService } from '@okr/shared-feature';

import { Avatars } from '@okr/avatar-ui';
import { CaleventI18n, calEventValidations, formatDurationLabel, isPersonalCalevent } from '@okr/calevent-util';

const MAX_LOCATION_SUGGESTIONS = 8;
/** the periodicity a freshly switched-on series starts with; the user picks another one right below */
const DEFAULT_RECURRING_PERIODICITY = 'weekly';

@Component({
  selector: 'okr-calevent-form',
  standalone: true,
  imports: [
    CategorySelect, Chips, NotesInput, DateInput, TimeInput, NumberInput,
    TextInput, ErrorNote, StringList, Avatars, Checkbox, UrlInput, AddChip,
    SvgIconPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonList, IonItem, IonLabel, IonNote, IonIcon
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-note.poll-series { display: block; padding: 0 16px 8px; font-size: 12px; }
    /* the section heading of a card ('Was', 'Wann', ...) — a label, not a field */
    .section-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px 0; }
    .section-row ion-icon { font-size: 16px; color: var(--ion-color-medium, #6d7683); }
    /* a block that only appears on request keeps a tinted ground, so it reads as revealed.
       --ion-item-background cascades into the field primitives, whose ion-items would
       otherwise paint white rectangles on top of that ground. */
    .revealed {
      background: var(--ion-color-light, #f6f8fa);
      --ion-item-background: transparent;
    }
    /* the plain-text result of the series settings */
    .series-preview {
      display: block;
      margin: 0 8px 8px;
      padding: 8px 12px;
      border-radius: 4px;
      background: rgba(var(--ion-color-success-rgb), 0.14);
      color: var(--ion-color-success-shade);
      font-size: 13px;
      line-height: 1.45;
    }
    ion-label.section {
      display: block;
      padding: 0;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--ion-color-medium, #6d7683);
    }
  `],
  template: `
  @if (showForm()) {
  <form novalidate>

    <!-- WAS: the two fields that identify the event. Everything a plain organiser needs is on
         screen; the toolbar toggle (showAdvanced) only ever ADDS organisational fields. -->
    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <div class="section-row">
                <ion-icon src="{{ 'info-circle' | svgIcon }}" />
                <ion-label class="section">{{ i18n().form_section_what() }}</ion-label>
              </div>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12">
              <okr-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [fieldStyle]="true" [label]="i18n().type_label()" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12">
              <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="nameErrors()" />
            </ion-col>
          </ion-row>
          @if(hasRole('admin') && !isPersonal()) {
            <ion-row>
              <ion-col size="12">
                <!-- the description is part of what the event IS: same card, no card of its own -->
                <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [embedded]="true" [fieldStyle]="true" [rows]="3" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <!-- WANN: date/time first, then the two switches. The series configuration (periodicity +
         repeatUntilDate) stays out of the way until 'Wiederholt sich' asks for it. -->
    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <div class="section-row">
                <ion-icon src="{{ 'calendar' | svgIcon }}" />
                <ion-label class="section">{{ i18n().form_section_when() }}</ion-label>
              </div>
            </ion-col>
          </ion-row>
          @if(!fullDay()) {
            <ion-row>
              <ion-col size="12" size-md="6" size-lg="4">
                <okr-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6" size-lg="4">
                <okr-time-input [i18n]="startTimeI18n()" [value]="startTime()" (valueChange)="onFieldChange('startTime', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6" size-lg="4">
                <!-- the field keeps the duration in minutes; the helper spells it out ('1 h 30 min') -->
                <okr-number-input [i18n]="durationMinutesI18n()" [value]="durationMinutes()" (valueChange)="onFieldChange('durationMinutes', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
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
          <!-- personal events support a reduced feature set: no fullDay, no series, no location, no url -->
          @if(!isPersonal()) {
            <ion-row>
              <ion-col size="12">
                <okr-checkbox [i18n]="fullDayI18n()" [checked]="fullDay()" (checkedChange)="onFullDayChange($event)" [toggle]="true" iconName="calendar" labelPlacement="start" justify="space-between" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <okr-checkbox [i18n]="recurringI18n()" [checked]="isRecurring()" (checkedChange)="onRecurringChange($event)" [toggle]="true" iconName="repeat" labelPlacement="start" justify="space-between" [readOnly]="isReadOnly() || isPollSeries()" />
                @if (isPollSeries()) { <ion-note class="poll-series">{{ i18n().poll_series_helper() }}</ion-note> }
              </ion-col>
            </ion-row>
            @if(isRecurring()) {
              <ion-row class="revealed">
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="periodicities()!" [selectedItemName]="periodicity()" (selectedItemNameChange)="onFieldChange('periodicity', $event)" [readOnly]="isReadOnly() || isPollSeries()" [withAll]="false" [fieldStyle]="true" [label]="i18n().periodicity_label()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="repeatUntilDateI18n()" [storeDate]="repeatUntilDate()" (storeDateChange)="onFieldChange('repeatUntilDate', $event)" [locale]="locale()" [mask]="chFutureDate" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="repeatUntilDateErrors()" />
                </ion-col>
                @if(seriesPreview().length > 0) {
                  <ion-col size="12">
                    <span class="series-preview">{{ seriesPreview() }}</span>
                  </ion-col>
                }
              </ion-row>
            }
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <!-- WO: location stays gated on the editor roles (same rule as before), the link pair only
         earns its rows once a url is set or the advanced toggle is on. -->
    @if(!isPersonal() && canExpert()) {
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
              <div class="section-row">
                <ion-icon src="{{ 'location' | svgIcon }}" />
                <ion-label class="section">{{ i18n().form_section_where() }}</ion-label>
              </div>
            </ion-col>
            </ion-row>
            @if(canExpert()) {
              <ion-row>
                <ion-col size="12">
                  <!-- typing filters the known locations; picking one stores 'name@okey',
                       otherwise the typed text is kept as a free-text location -->
                  <okr-text-input [i18n]="locationKeyI18n()" [value]="locationLabel()" (valueChange)="onLocationInput($event)" [readOnly]="isReadOnly()" />
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
            <!-- an existing link always shows; an empty one costs a chip instead of two empty fields -->
            @if(showLinkFields()) {
              <ion-row class="revealed">
                <ion-col size="12" size-md="6">
                  <okr-url [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="urlLabelI18n()" [value]="urlLabel()" (valueChange)="onFieldChange('urlLabel', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <okr-add-chip [label]="i18n().form_link_remove()" iconName="cancel" [readOnly]="isReadOnly()" (addClicked)="removeLink()" />
                </ion-col>
              </ion-row>
            } @else {
              <ion-row>
                <ion-col size="12">
                  <okr-add-chip [label]="i18n().form_link_add()" iconName="link" [readOnly]="isReadOnly()" (addClicked)="addLink()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    }

    <!-- WER -->
    @if(currentUser(); as currentUser) {
      <!-- the organiser is the creator; only eventAdmin/privileged (and never on a personal event) may change it -->
      <okr-avatars name="responsiblePersons"
        [avatars]="responsiblePersons()" (avatarsChange)="onFieldChange('responsiblePersons', $event)"
        (selectClicked)="selectPerson()"
        [currentUser]="currentUser"
        [readOnly]="isReadOnly() || isPersonal() || !canExpert()"
        [title]="i18n().form_section_who()"
        [sectionStyle]="true"
        titleIcon="people"
        [addLabel]="i18n().form_person_add()"
        [description]="i18n().responsible_description()"
      />
    }

    <!---------------------------------------------------
      ORGANISATION: calendars and tags are internal organisation data — behind the toolbar toggle
      --------------------------------------------------->
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

    @if(expertMode() && !isPersonal()) {
      <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      <okr-error-note [errors]="tagsErrors()" />
    }

    <!-- the technical keys: last, and only with the advanced toggle on -->
    @if(expertMode()) {
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="okeyI18n()" [value]="okey()" [readOnly]="true" [copyable]="true" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="seriesIdI18n()" [value]="seriesId()" [readOnly]="true" [copyable]="true" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
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
  /** two-way with the parent modal: the toolbar toggle that reveals the organisational fields */
  public readonly showAdvanced = model(false);
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
    if (this.canExpert() && !this.isPersonal()) fields.push('locationKey');
    if (this.expertMode() && !this.isPersonal()) fields.push('tags');
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
  protected isRecurring = computed(() => !!this.periodicity() && this.periodicity() !== DEFAULT_PERIODICITY);
  /**
   * A poll-born series: the organizer confirmed several dates of a Terminumfrage. Those dates are
   * irregular, so no periodicity describes them — turning it into a rule-based series would let
   * planSeriesReconcile archive every sibling date as surplus. The field is locked here; the Vest
   * suite (caleventPollSeriesPeriodicityLocked) and the store are the backstops.
   */
  /**
   * Spells out what the current series settings produce ('Ergibt 11 Termine, der letzte am
   * 26.06.2026.'). Without it the number of dates only surfaces when the Vest suite rejects a
   * series of more than MAX_DATES_PER_SERIES.
   */
  protected seriesPreview = computed(() => {
    if (!this.isRecurring()) return '';
    const until = this.repeatUntilDate();
    if (this.startDate().length !== 8 || until.length !== 8) return '';
    const dates = calculateRecurringDates(this.startDate(), until, this.periodicity());
    if (dates.length === 0) return '';
    const lastDate = convertDateFormatToString(dates[dates.length - 1], DateFormat.StoreDate, DateFormat.ViewDate, false);
    return fill(this.i18n().series_preview(), { count: dates.length, date: lastDate });
  });
  protected isPollSeries = computed(() => this.formData().pollMultiSelect === true);
  protected repeatUntilDate = linkedSignal(() => this.formData().repeatUntilDate ?? DEFAULT_DATE);
  protected url = linkedSignal(() => this.formData().url ?? DEFAULT_URL);
  protected urlLabel = linkedSignal(() => this.formData().urlLabel ?? DEFAULT_LABEL);
  protected locationKey = linkedSignal(() => this.formData().locationKey ?? DEFAULT_KEY);
  // the field shows the readable part of 'name@okey' (or the free text if no location was picked)
  protected locationLabel = linkedSignal(() => extractFirstPartOfOptionalTupel(this.formData().locationKey ?? '', '@'));
  /** the url/urlLabel pair is revealed by the add-chip; a link that is already set shows anyway */
  private linkRequested = signal(false);
  protected showLinkFields = computed(() => this.linkRequested() || this.url().length > 0);
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
  // location, calendars and tags — gating these on 'admin' hid them from eventAdmin/privileged editors.
  // canExpert is the ROLE gate (who is offered the advanced fields at all), expertMode adds the
  // toolbar toggle on top (whether they are currently shown). Location and the organiser stay on
  // canExpert: they are part of the event itself, not organisational extras.
  protected canExpert = computed(() => this.hasRole('eventAdmin') || this.hasRole('privileged'));
  protected expertMode = computed(() => this.canExpert() && this.showAdvanced());
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
    helper: ''   // UrlInput renders any non-empty helper; the form shows no helper texts
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

  /** the helper shows the entered minutes as a readable duration ('90' -> '1 h 30 min') */
  protected durationMinutesI18n = computed(() => ({
    name: 'durationMinutes',
    label: this.i18n().durationMinutes(),
    placeholder: this.i18n().durationMinutes_placeholder(),
    helper: formatDurationLabel(this.durationMinutes()) || this.i18n().durationMinutes_helper()
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

  protected recurringI18n = computed(() => ({
    name: 'isRecurring',
    label: this.i18n().recurring_label(),
    helper: this.i18n().recurring_helper(),
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

  /** the add-chip: reveal the url/urlLabel pair without writing anything to the model yet */
  protected addLink(): void {
    this.linkRequested.set(true);
  }

  /** the remove-chip: clear both link fields and fold the block back into the chip */
  protected removeLink(): void {
    this.linkRequested.set(false);
    this.formData.update(vm => ({ ...vm, url: DEFAULT_URL, urlLabel: DEFAULT_LABEL }));
    this.dirty.emit(true);
  }

  /**
   * The 'Wiederholt sich' switch drives the periodicity: switching it on seeds a weekly series
   * (the user picks another periodicity right below), switching it off returns the event to a
   * single date and clears the now meaningless repeatUntilDate.
   */
  protected onRecurringChange(isRecurring: boolean): void {
    if (isRecurring) {
      this.formData.update(vm => ({ ...vm, periodicity: DEFAULT_RECURRING_PERIODICITY }));
    } else {
      this.formData.update(vm => ({ ...vm, periodicity: DEFAULT_PERIODICITY, repeatUntilDate: DEFAULT_DATE }));
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

import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ChFutureDate, LowercaseWordMask } from '@bk2/shared-config';
import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TIME, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, CalEventModel, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Checkbox, CheckboxI18n, Chips, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringList, TextInput, TextInputI18n, TimeInput, TimeInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { ModelSelectService } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';

import { Avatars } from '@bk2/avatar-ui';
import { calEventValidations } from '@bk2/calevent-util';
import { PFX } from './scope';

@Component({
  selector: 'bk-calevent-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelect, Chips, NotesInput, DateInput, TimeInput, NumberInput,
    TextInput, ErrorNote, StringList, Avatars, Checkbox,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
  <form scVestForm
    [formValue]="formData()"
    (formValueChange)="onFormChange($event)"
    [suite]="suite"
    (dirtyChange)="dirty.emit($event)"
    (validChange)="valid.emit($event)"
  >

    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          @if(expertMode()) {
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="seriesIdI18n()" [value]="seriesId()" [readOnly]="true" [copyable]="true" />
              </ion-col>
            </ion-row>
          }
            <ion-row>
              <ion-col size="12">
                <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false"  [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="fullDayI18n()" [checked]="fullDay()" (checkedChange)="onFullDayChange($event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            @if(!fullDay()) {
              <ion-row>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-time-input [i18n]="startTimeI18n()" [value]="startTime()" (valueChange)="onFieldChange('startTime', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-number-input [i18n]="durationMinutesI18n()" [value]="durationMinutes()" (valueChange)="onFieldChange('durationMinutes', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            } @else {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-date-input [i18n]="endDateI18n()" [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="periodicities()!" [selectedItemName]="periodicity()" (selectedItemNameChange)="onFieldChange('periodicity', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
              </ion-col>
              @if(isRecurring()) {
                <ion-col size="12" size-md="6">
                  <bk-date-input [i18n]="repeatUntilDateI18n()" [storeDate]="repeatUntilDate()" (storeDateChange)="onFieldChange('repeatUntilDate', $event)" [locale]="locale()" [mask]="chFutureDate" [readOnly]="isReadOnly()" />
                </ion-col>
              }
            </ion-row>
            @if(expertMode()) {
              <ion-row>
                <ion-col size="12">
                  <!-- tbd: locationKey is currently only a text field, should be [key]@[name], e.g.  qlöh1341hkqj@Stäfa -->
                  <bk-text-input [i18n]="locationKeyI18n()" [value]="locationKey()" (valueChange)="onFieldChange('locationKey', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(currentUser(); as currentUser) {
      <bk-avatars name="responsiblePersons"
        [avatars]="responsiblePersons()" (avatarsChange)="onFieldChange('responsiblePersons', $event)"
        (selectClicked)="selectPerson()"
        [currentUser]="currentUser"
        [readOnly]="isReadOnly()"
        title="@calevent.field.responsible.label"
        description="@calevent.field.responsible.description"
        addLabel="@calevent.field.responsible.addLabel"
      />
    }

    <bk-strings
      [strings]="calendars()"
      (stringsChange)="onFieldChange('calendars', $event)"
      [mask]="calendarMask"
      [maxLength]="nameLength"
      [readOnly]="isReadOnly()"
      inputStyle="select" (selectClicked)="calendarSelectClicked.emit()"
      title="@input.calendarName.label"
      description="@input.calendarName.description"
      addLabel="@input.calendarName.addLabel"
      selectLabel="@input.calendarName.select"
    />

  <!---------------------------------------------------
    TAG, NOTES
    --------------------------------------------------->
    @if(expertMode()) {
      <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
    }

    @if(hasRole('admin')) {
      <bk-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
    }
  </form>
  }
`
})
export class CalEventForm {
  private readonly modelSelectService = inject(ModelSelectService);
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<CalEventModel>();
  public readonly currentUser = input.required<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readonly locale = input.required<string>();
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public calendarSelectClicked = output<void>();

  // validation and errors
  protected readonly suite = calEventValidations;
  private readonly validationResult = computed(() => calEventValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected bkey = linkedSignal(() => this.formData().bkey ?? '');
  protected seriesId = linkedSignal(() => this.formData().seriesId ?? '');
  protected type = linkedSignal(() => this.formData().type ?? DEFAULT_CALEVENT_TYPE);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected fullDay = linkedSignal(() => this.formData().fullDay ?? false);
  protected startDate = linkedSignal(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = linkedSignal(() => this.formData().startTime ?? DEFAULT_TIME);
  protected endDate = linkedSignal(() => this.formData().endDate ?? this.startDate());
  protected durationMinutes = linkedSignal(() => this.formData().durationMinutes ?? 60);
  protected periodicity = linkedSignal(() => this.formData().periodicity ?? DEFAULT_PERIODICITY);
  protected isRecurring = computed(() => this.periodicity() && this.periodicity() !== 'once');
  protected repeatUntilDate = linkedSignal(() => this.formData().repeatUntilDate ?? DEFAULT_DATE);
  protected locationKey = linkedSignal(() => this.formData().locationKey ?? DEFAULT_KEY);
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
  protected expertMode = computed(() => this.hasRole('admin'));

  // passing constants to template
  protected chFutureDate = ChFutureDate;
  protected calendarMask = LowercaseWordMask;
  protected nameLength = NAME_LENGTH;

  // i18n
  protected readonly fieldI18n = this.i18nService.translateAll({
    bkey_label:           PFX + 'bkey.label',
    bkey_placeholder:     PFX + 'bkey.placeholder',
    bkey_helper:          PFX + 'bkey.helper',
    seriesId_label:       PFX + 'seriesId.label',
    seriesId_placeholder: PFX + 'seriesId.placeholder',
    seriesId_helper:      PFX + 'seriesId.helper',
    name_label:           PFX + 'name.label',
    name_placeholder:     PFX + 'name.placeholder',
    name_helper:          PFX + 'name.helper',
    locationKey_label:            PFX + 'locationKey.label',
    locationKey_placeholder:      PFX + 'locationKey.placeholder',
    locationKey_helper:           PFX + 'locationKey.helper',
    durationMinutes_label:        PFX + 'durationMinutes.label',
    durationMinutes_placeholder:  PFX + 'durationMinutes.placeholder',
    durationMinutes_helper:       PFX + 'durationMinutes.helper',
    description_label:            PFX + 'description.label',
    description_placeholder:      PFX + 'description.placeholder',
    startDate_label:              PFX + 'startDate.label',
    startDate_placeholder:        PFX + 'startDate.placeholder',
    startDate_helper:             PFX + 'startDate.helper',
    endDate_label:                PFX + 'endDate.label',
    endDate_placeholder:          PFX + 'endDate.placeholder',
    endDate_helper:               PFX + 'endDate.helper',
    repeatUntilDate_label:        PFX + 'repeatUntilDate.label',
    repeatUntilDate_placeholder:  PFX + 'repeatUntilDate.placeholder',
    repeatUntilDate_helper:       PFX + 'repeatUntilDate.helper',
    startTime_label:              PFX + 'startTime.label',
    startTime_placeholder:        PFX + 'startTime.placeholder',
    fullDay_label:                PFX + 'fullDay.label',
    fullDay_helper:               PFX + 'fullDay.helper',
  });

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.fieldI18n.bkey_label(),
    placeholder: this.fieldI18n.bkey_placeholder(),
    helper: this.fieldI18n.bkey_helper()
  } as TextInputI18n));

  protected seriesIdI18n = computed(() => ({
    name: 'seriesId',
    label: this.fieldI18n.seriesId_label(),
    placeholder: this.fieldI18n.seriesId_placeholder(),
    helper: this.fieldI18n.seriesId_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.fieldI18n.name_label(),
    placeholder: this.fieldI18n.name_placeholder(),
    helper: this.fieldI18n.name_helper()
  } as TextInputI18n));

  protected locationKeyI18n = computed(() => ({
    name: 'locationKey',
    label: this.fieldI18n.locationKey_label(),
    placeholder: this.fieldI18n.locationKey_placeholder(),
    helper: this.fieldI18n.locationKey_helper()
  } as TextInputI18n));

  protected durationMinutesI18n = computed(() => ({
    name: 'durationMinutes',
    label: this.fieldI18n.durationMinutes_label(),
    placeholder: this.fieldI18n.durationMinutes_placeholder(),
    helper: this.fieldI18n.durationMinutes_helper()
  } as NumberInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description', label: this.fieldI18n.description_label(), placeholder: this.fieldI18n.description_placeholder()
  } as NotesInputI18n));

  protected startDateI18n = computed(() => ({
    name: 'startDate',
    label: this.fieldI18n.startDate_label(),
    placeholder: this.fieldI18n.startDate_placeholder(),
    helper: this.fieldI18n.startDate_helper()
  } as DateInputI18n));

  protected endDateI18n = computed(() => ({
    name: 'endDate',
    label: this.fieldI18n.endDate_label(),
    placeholder: this.fieldI18n.endDate_placeholder(),
    helper: this.fieldI18n.endDate_helper()
  } as DateInputI18n));

  protected repeatUntilDateI18n = computed(() => ({
    name: 'repeatUntilDate',
    label: this.fieldI18n.repeatUntilDate_label(),
    placeholder: this.fieldI18n.repeatUntilDate_placeholder(),
    helper: this.fieldI18n.repeatUntilDate_helper()
  } as DateInputI18n));

  protected startTimeI18n = computed(() => ({
    name: 'startTime',
    label: this.fieldI18n.startTime_label(),
    placeholder: this.fieldI18n.startTime_placeholder(),
  } as TimeInputI18n));

  protected fullDayI18n = computed(() => ({
    name: 'fullDay',
    label: this.fieldI18n.fullDay_label(),
    helper: this.fieldI18n.fullDay_helper(),
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

  protected onFormChange(value: CalEventModel): void {
    // calendars, responsiblePersons, tags and description are managed via onFieldChange (not vest form controls), so preserve them
    this.formData.update((vm) => ({...vm, ...value, calendars: vm.calendars, responsiblePersons: vm.responsiblePersons, tags: vm.tags, description: vm.description}));
    debugFormModel('CalEventForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('CalEventForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

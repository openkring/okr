import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ChFutureDate, LowercaseWordMask } from '@bk2/shared-config';
import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TIME, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, CalEventModel, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Checkbox, CheckboxI18n, Chips, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringList, TextInput, TextInputI18n, TimeInput, TimeInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { ModelSelectService } from '@bk2/shared-feature';

import { Avatars } from '@bk2/avatar-ui';
import { CaleventI18n, calEventValidations } from '@bk2/calevent-util';

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
        [title]="i18n().responsible()"
        [description]="i18n().responsible_description()"
      />
    }

    <bk-strings
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

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.i18n().bkey_label(),
    placeholder: this.i18n().bkey_placeholder(),
    helper: this.i18n().bkey_helper()
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

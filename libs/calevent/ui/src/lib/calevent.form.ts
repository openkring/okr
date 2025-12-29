import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ChFutureDate, LowercaseWordMask } from '@bk2/shared-config';
import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TIME, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, CalEventModel, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, ErrorNoteComponent, NotesInputComponent, StringsComponent, TextInputComponent, TimeInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, convertDateFormatToString, DateFormat, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { ModelSelectService } from '@bk2/shared-feature';

import { AvatarsComponent } from '@bk2/avatar-ui';
import { calEventValidations } from '@bk2/calevent-util';

@Component({
  selector: 'bk-calevent-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelectComponent, ChipsComponent, NotesInputComponent, DateInputComponent, TimeInputComponent,
    TextInputComponent, ChipsComponent, ErrorNoteComponent, StringsComponent, AvatarsComponent,
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
          <ion-row>
            <ion-col size="12">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false"  [readOnly]="isReadOnly()" />
            </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [readOnly]="isReadOnly()" /> 
                <bk-error-note [errors]="nameErrors()" />                                                                               
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input name="startDate"  [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-time-input name="startTime" [value]="startTime()" (valueChange)="onFieldChange('startTime', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="endDate"  [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-time-input name="endTime" [value]="endTime()" (valueChange)="onFieldChange('endTime', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="periodicities()!" [selectedItemName]="periodicity()" (selectedItemNameChange)="onFieldChange('periodicity', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
              </ion-col>
              @if(periodicity() !== 'once') {
                <ion-col size="12" size-md="6">
                  <bk-date-input name="repeatUntilDate" [storeDate]="repeatUntilDate()" (storeDateChange)="onFieldChange('repeatUntilDate', $event)" [locale]="locale()" [mask]="chFutureDate" [readOnly]="isReadOnly()" [showHelper]=true />
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <!-- tbd: locationKey is currently only a text field, should be [key]@[name], e.g.  qlöh1341hkqj@Stäfa -->
                <bk-text-input name="locationKey" [value]="locationKey()" (valueChange)="onFieldChange('locationKey', $event)" [readOnly]="isReadOnly()" />                                        
              </ion-col>
            </ion-row>
          </ion-grid>
      </ion-card-content>
    </ion-card>
 
    @if(currentUser(); as currentUser) {
      <bk-avatars
        (selectClicked)="selectPerson()"
        name="responsiblePersons"
        [avatars]="responsiblePersons()"
        (avatarsChange)="onFieldChange('responsiblePersons', $event)"
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
      title="@input.calendarName.label"
      description="@input.calendarName.description"
      addLabel="@input.calendarName.addLabel"
    />           

  <!---------------------------------------------------
    TAG, NOTES 
    --------------------------------------------------->
    @if(hasRole('privileged') || hasRole('eventAdmin')) {
      <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
    }

    @if(hasRole('admin')) {
      <bk-notes name="description" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
    }
  </form>
  }
`
})
export class CalEventFormComponent {
  private readonly modelSelectService = inject(ModelSelectService);

  // inputs
  public formData = model.required<CalEventModel>();
  public readonly currentUser = input.required<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readonly locale = input.required<string>();
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = calEventValidations;
  private readonly validationResult = computed(() => calEventValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected type = linkedSignal(() => this.formData().type ?? DEFAULT_CALEVENT_TYPE);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected startDate = linkedSignal(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = linkedSignal(() => this.formData().startTime ?? DEFAULT_TIME);
  protected endDate = linkedSignal(() => this.formData().endDate ?? DEFAULT_DATE);
  protected endTime = linkedSignal(() => this.formData().endTime ?? DEFAULT_TIME);
  protected periodicity = linkedSignal(() => this.formData().periodicity ?? DEFAULT_PERIODICITY);
  protected repeatUntilDate = linkedSignal(() => convertDateFormatToString(this.formData().repeatUntilDate, DateFormat.StoreDate, DateFormat.ViewDate));
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

  // passing constants to template
  protected chFutureDate = ChFutureDate;
  protected calendarMask = LowercaseWordMask;
  protected nameLength = NAME_LENGTH;

  /******************************* actions *************************************** */
  public async selectPerson(): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar('', DEFAULT_LABEL);
    if (avatar) {
        const responsiblePersons = this.responsiblePersons();
        responsiblePersons.push(avatar);
        this.onFieldChange('responsiblePersons', responsiblePersons);
    }
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
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('CalEventForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('CalEventForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms, vestFormsViewProviders } from 'ngx-vest-forms';

import { ChFutureDate, LowercaseWordMask } from '@bk2/shared-config';
import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TIME, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, ErrorNoteComponent, NotesInputComponent, StringsComponent, TextInputComponent, TimeInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, convertDateFormatToString, DateFormat, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { AvatarsComponent } from '@bk2/avatar-ui';
import { CAL_EVENT_FORM_SHAPE, CalEventFormModel, calEventFormValidations } from '@bk2/calevent-util';

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
  viewProviders: [vestFormsViewProviders],
  template: ` 
  <form scVestForm 
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-cat-select [category]="types()!" selectedItemName="typeName()" [withAll]="false"  [readOnly]="isReadOnly()" (changed)="onFieldChange('calEventType', $event)" />
            </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="name" [value]="name()" [autofocus]="true" [readOnly]="isReadOnly()"  (changed)="onFieldChange('name', $event)" /> 
                <bk-error-note [errors]="nameErrors()" />                                                                               
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input name="startDate"  [storeDate]="startDate()" [locale]="locale()" [readOnly]="isReadOnly()" [showHelper]=true  (changed)="onFieldChange('startDate', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-time-input name="startTime" [value]="startTime()" [locale]="locale()" [readOnly]="isReadOnly()"  (changed)="onFieldChange('startTime', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="endDate"  [storeDate]="endDate()" [showHelper]=true [readOnly]="isReadOnly()"  (changed)="onFieldChange('endDate', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-time-input name="endTime" [value]="endTime()" [locale]="locale()" [readOnly]="isReadOnly()"  (changed)="onFieldChange('endTime', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="periodicities()!" selectedItemName="periodicity()" [readOnly]="isReadOnly()" [withAll]="false" (changed)="onFieldChange('periodicity', $event)" />
              </ion-col>
              @if(periodicity() !== 'once') {
                <ion-col size="12" size-md="6">
                  <bk-date-input name="repeatUntilDate" [storeDate]="repeatUntilDate()" [locale]="locale()" [readOnly]="isReadOnly()" [mask]="chFutureDate" [showHelper]=true  (changed)="onFieldChange('repeatUntilDate', $event)" />
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <!-- tbd: locationKey is currently only a text field, should be [key]@[name], e.g.  qlöh1341hkqj@Stäfa -->
                <bk-text-input name="locationKey" [value]="locationKey()" [readOnly]="isReadOnly()"  (changed)="onFieldChange('locationKey', $event)" />                                        
              </ion-col>
            </ion-row>
          </ion-grid>
      </ion-card-content>
    </ion-card>
 
    <bk-avatars name="responsiblePersons" [avatars]="responsiblePersons()" [currentUser]="currentUser()" [readOnly]="isReadOnly()" (changed)="onFieldChange('responsiblePersons', $event)" />

    <bk-strings (changed)="onFieldChange('calendars', $event)"
              [strings]="calendars()" 
              [mask]="calendarMask" 
              [maxLength]="nameLength"
              [readOnly]="isReadOnly()" 
              title="@input.calendarName.label"
              description="@input.calendarName.description"
              addLabel="@input.calendarName.addLabel" />           

     <!---------------------------------------------------
        TAG, NOTES 
        --------------------------------------------------->
        @if(hasRole('privileged')) {
          <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
        }
    
        @if(hasRole('admin')) {
          <bk-notes name="description" [value]="description()" [readOnly]="isReadOnly()" (changed)="onFieldChange('description', $event)" />
        }
  </form>
`
})
export class CalEventFormComponent {
  protected modalController = inject(ModalController);

  // inputs
  public formData = model.required<CalEventFormModel>();
  public readonly currentUser = input.required<UserModel>();
  public readonly types = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readonly allTags = input.required<string>();
  public readonly locale = input.required<string>();
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = calEventFormValidations;
  protected readonly shape = CAL_EVENT_FORM_SHAPE;
  private readonly validationResult = computed(() => calEventFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected typeName = computed(() => this.formData().type ?? DEFAULT_CALEVENT_TYPE);
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected startDate = computed(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = computed(() => this.formData().startTime ?? DEFAULT_TIME);
  protected endDate = computed(() => this.formData().endDate ?? DEFAULT_DATE);
  protected endTime = computed(() => this.formData().endTime ?? DEFAULT_TIME);
  protected periodicity = computed(() => this.formData().periodicity ?? DEFAULT_PERIODICITY);
  protected repeatUntilDate = computed(() => convertDateFormatToString(this.formData().repeatUntilDate, DateFormat.StoreDate, DateFormat.ViewDate));
  protected locationKey = computed(() => this.formData().locationKey ?? DEFAULT_KEY);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected description = computed(() => this.formData().description ?? DEFAULT_NOTES);
  protected calendars = computed(() => this.formData().calendars ?? DEFAULT_CALENDARS);
  protected responsiblePersons = computed(() => {
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

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: CalEventFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('CalEventForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean | AvatarInfo[]): void {
    this.dirty.emit(true);
    if (fieldName === 'responsiblePersons') {
      const normalized = (fieldValue as AvatarInfo[]).map(p => ({
        key: p.key ?? '',
        label: p.label ?? p.name1 ?? '',
        modelType: p.modelType ?? 'person',
        name1: p.name1 ?? '',
        name2: p.name2 ?? ''
      }));
      this.formData.update(vm => ({ ...vm, responsiblePersons: normalized }));
    } else {
      this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
    }
    debugFormErrors('CalEventForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
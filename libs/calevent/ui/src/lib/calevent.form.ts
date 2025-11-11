import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ChFutureDate, LowercaseWordMask } from '@bk2/shared-config';
import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TIME, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { AvatarsComponent, CategorySelectComponent, ChipsComponent, DateInputComponent, ErrorNoteComponent, NotesInputComponent, StringsComponent, TextInputComponent, TimeInputComponent } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { CalEventFormModel, calEventFormModelShape, calEventFormValidations } from '@bk2/calevent-util';

@Component({
  selector: 'bk-calevent-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelectComponent, ChipsComponent, NotesInputComponent, DateInputComponent, TimeInputComponent,
    TextInputComponent, ChipsComponent, ErrorNoteComponent, StringsComponent, AvatarsComponent,
    IonGrid, IonRow, IonCol
],
  template: ` 
  <form scVestForm 
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-grid>
      <ion-row>
        <ion-col size="12">
          <bk-cat-select [category]="types()!" selectedItemName="typeName()" [withAll]="false" (changed)="onChange('calEventType', $event)" />
        </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12">
            <bk-text-input name="name" [value]="name()" [autofocus]="true"  (changed)="onChange('name', $event)" /> 
            <bk-error-note [errors]="nameErrors()" />                                                                               
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12" size-md="6">
            <bk-date-input name="startDate"  [storeDate]="startDate()" [locale]="locale()" [showHelper]=true  (changed)="onChange('startDate', $event)" />
          </ion-col>
          <ion-col size="12" size-md="6">
            <bk-time-input name="startTime" [value]="startTime()" [locale]="locale()"  (changed)="onChange('startTime', $event)" />
          </ion-col>
          <ion-col size="12" size-md="6">
            <bk-date-input name="endDate"  [storeDate]="endDate()" [showHelper]=true  (changed)="onChange('endDate', $event)" />
          </ion-col>
          <ion-col size="12" size-md="6">
            <bk-time-input name="endTime" [value]="endTime()" [locale]="locale()"  (changed)="onChange('endTime', $event)" />
          </ion-col>
          <ion-col size="12" size-md="6">
            <bk-cat-select [category]="periodicities()!" selectedItemName="periodicity()" [withAll]="false" (changed)="onChange('periodicity', $event)" />
          </ion-col>
          @if(periodicity() !== 'once') {
            <ion-col size="12" size-md="6">
              <bk-date-input name="repeatUntilDate" [storeDate]="repeatUntilDate()" [locale]="locale()" [mask]="chFutureDate" [showHelper]=true  (changed)="onChange('repeatUntilDate', $event)" />
            </ion-col>
          }
        </ion-row>
      
      <ion-row>
        <ion-col size="12">
          <!-- tbd: locationKey is currently only a text field, should be [key]@[name], e.g.  qlöh1341hkqj@Stäfa -->
          <bk-text-input name="locationKey" [value]="locationKey()"  (changed)="onChange('locationKey', $event)" />                                        
        </ion-col>
      </ion-row>
    </ion-grid>
    
    <bk-avatars name="responsiblePersons" [avatars]="responsiblePersons()" (changed)="onChange('responsiblePersons', $event)" />

    <bk-strings (changed)="onChange('calendars', $event)"
              [strings]="calendars()" 
              [mask]="calendarMask" 
              [maxLength]="nameLength" 
              title="@input.calendarName.label"
              description="@input.calendarName.description"
              addLabel="@input.calendarName.addLabel" />           

     <!---------------------------------------------------
        TAG, NOTES 
        --------------------------------------------------->
        @if(hasRole('privileged')) {
          <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" (changed)="onChange('tags', $event)" />
        }
    
        @if(hasRole('admin')) {
          <bk-notes name="description" [value]="description()" (changed)="onChange('description', $event)" />
        }
  </form>
`
})
export class CalEventFormComponent {
  protected modalController = inject(ModalController);

  public vm = model.required<CalEventFormModel>();
  public currentUser = input<UserModel | undefined>();
  public types = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public allTags = input.required<string>();
  public locale = input.required<string>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected typeName = computed(() => this.vm().type ?? DEFAULT_CALEVENT_TYPE);
  protected name = computed(() => this.vm().name ?? DEFAULT_NAME);

  protected startDate = computed(() => this.vm().startDate ?? DEFAULT_DATE);
  protected startTime = computed(() => this.vm().startTime ?? DEFAULT_TIME);
  protected endDate = computed(() => this.vm().endDate ?? DEFAULT_DATE);
  protected endTime = computed(() => this.vm().endTime ?? DEFAULT_TIME);

  protected periodicity = computed(() => this.vm().periodicity ?? DEFAULT_PERIODICITY);
  protected repeatUntilDate = computed(() => convertDateFormatToString(this.vm().repeatUntilDate, DateFormat.StoreDate, DateFormat.ViewDate));
  protected locationKey = computed(() => this.vm().locationKey ?? DEFAULT_KEY);
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected description = computed(() => this.vm().description ?? DEFAULT_NOTES);
  protected calendars = computed(() => this.vm().calendars ?? DEFAULT_CALENDARS);
  protected responsiblePersons = computed(() => this.vm().responsiblePersons ?? []);

  protected readonly suite = calEventFormValidations;
  protected readonly shape = calEventFormModelShape;
  private readonly validationResult = computed(() => calEventFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected chFutureDate = ChFutureDate;
  protected calendarMask = LowercaseWordMask;
  protected nameLength = NAME_LENGTH;
  
  protected onValueChange(value: CalEventFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean | AvatarInfo[]): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('CalEventForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
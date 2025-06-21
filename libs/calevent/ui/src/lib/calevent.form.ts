import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AvatarsComponent, CategoryComponent, ChipsComponent, DateInputComponent, ErrorNoteComponent, NotesInputComponent, StringsComponent, TextInputComponent, TimeInputComponent } from '@bk2/shared/ui';
import { ChFutureDate, LowercaseWordMask, NAME_LENGTH } from '@bk2/shared/config';
import { CalEventTypes, PeriodicityTypes } from '@bk2/shared/categories';
import { AvatarInfo, CalEventType, Periodicity, UserModel } from '@bk2/shared/models';
import { convertDateFormatToString, DateFormat, debugFormErrors } from '@bk2/shared/util';

import { CalEventFormModel, calEventFormModelShape, calEventFormValidations } from '@bk2/calevent/util';

@Component({
  selector: 'bk-calevent-form',
  imports: [
    vestForms,
    CategoryComponent, ChipsComponent, NotesInputComponent, DateInputComponent,
    TimeInputComponent, TextInputComponent, ChipsComponent, ErrorNoteComponent, StringsComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent,
    AvatarsComponent
],
  template: `
  <form scVestForm 
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-cat name="calEventType" [value]="calEventType()" [categories]="calEventTypes" (changed)="onChange('calEventType', $event)" />
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
                <bk-cat name="periodicity" [value]="periodicity()" [categories]="periodicities"  (changed)="onChange('periodicity', $event)" />
              </ion-col>
              @if(periodicity() !== period.Once) {
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
      </ion-card-content>
    </ion-card>
    
    <bk-avatars name="responsiblePersons" [avatars]="responsiblePersons()" (changed)="onChange('responsiblePersons', $event)" />

    <bk-strings (changed)="onChange('calendars', $event)"
              [strings]="calendars()" 
              [mask]="calendarMask" 
              [maxLength]="nameLength" 
              title="@input.calendarName.label"
              description="@input.calendarName.description"
              addLabel="@input.calendarName.addLabel" />           

    @if(isPrivileged()) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="calEventTags()"  (changed)="onChange('tags', $event)" />
    }

    @if(isAdmin()) {
      <bk-notes name="description" [value]="description()" (changed)="onChange('description', $event)" />
    }
  </form>
`
})
export class CalEventFormComponent {
  protected modalController = inject(ModalController);

  public vm = model.required<CalEventFormModel>();
  public currentUser = input<UserModel>();
  public isAdmin = input(false);
  public isPrivileged = input(false);
  public calEventTags = input.required<string>();
  public locale = input.required<string>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected calEventType = computed(() => this.vm().type ?? CalEventType.SocialEvent);
  protected name = computed(() => this.vm().name ?? '');

  protected startDate = computed(() => this.vm().startDate ?? '');
  protected startTime = computed(() => this.vm().startTime ?? '');
  protected endDate = computed(() => this.vm().endDate ?? '');
  protected endTime = computed(() => this.vm().endTime ?? '');

  protected periodicity = computed(() => this.vm().periodicity ?? Periodicity.Once);
  protected repeatUntilDate = computed(() => convertDateFormatToString(this.vm().repeatUntilDate, DateFormat.StoreDate, DateFormat.ViewDate));
  protected locationKey = computed(() => this.vm().locationKey ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected description = computed(() => this.vm().description ?? '');
  protected calendars = computed(() => this.vm().calendars ?? []);
  protected responsiblePersons = computed(() => this.vm().responsiblePersons ?? []);

  protected readonly suite = calEventFormValidations;
  protected readonly shape = calEventFormModelShape;
  private readonly validationResult = computed(() => calEventFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected isChannelReadOnly = false;
  public ET = CalEventType;
  public calEventTypes = CalEventTypes;
  protected period = Periodicity;
  protected periodicities = PeriodicityTypes;
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
}
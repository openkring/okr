import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';
import { AgendaItem, MeetingModel, RoleName, UserModel } from '@okr/shared-models';
import { Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n, TimeInput, TimeInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { MeetingI18n, meetingValidations } from '@okr/content-meeting-util';
import { AgendaList } from './agenda-list';
import { AttendeeList } from './attendee-list';

@Component({
  selector: 'okr-meeting-form',
  standalone: true,
  imports: [
    TextInput, DateInput, TimeInput, NotesInput, Chips,
    AgendaList, AttendeeList,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="100" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="locationKeyI18n()" [value]="locationKey()" (valueChange)="onFieldChange('locationKey', $event)"
                    [maxLength]="100" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="meetingDateI18n()" [storeDate]="meetingDate()"
                    (storeDateChange)="onFieldChange('meetingDate', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-time-input [i18n]="startTimeI18n()" [value]="startTime()"
                    (valueChange)="onFieldChange('startTime', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <okr-attendee-list [attendees]="attendees()" (attendeesChange)="onListChange('attendees', $event)"
          [i18n]="i18n()" [readOnly]="isReadOnly()" />

        <okr-agenda-list [agenda]="agenda()" (agendaChange)="onListChange('agenda', $event)"
          [i18n]="i18n()" [readOnly]="isReadOnly()" [minutesMode]="minutesMode()"
          (addTask)="addTask.emit($event)" />

        <!-- guarded, always last -->
        @if (hasRole('privileged')) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)"
            [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('privileged')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
            [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `
})
export class MeetingForm {
  // inputs
  public readonly i18n = input.required<MeetingI18n>();
  public formData = model.required<MeetingModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly locale = input('de-ch');
  public readonly readOnly = input(true);
  public readonly showForm = input(true);
  /** minutes mode reveals the per-item minutes/decision fields of the agenda */
  public readonly minutesMode = input(false);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly addTask = output<AgendaItem>();

  // signal form — wraps formData with Vest validation
  protected readonly meetingForm = form(this.formData, (path) =>
    validateVestTree(path, meetingValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.meetingForm().valid()));
  }

  // computed field accessors — Firestore reads skip model defaults, so coalesce everything
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly locationKey = computed(() => this.formData()?.locationKey ?? '');
  protected readonly meetingDate = computed(() => this.formData()?.meetingDate ?? '');
  protected readonly startTime = computed(() => this.formData()?.startTime ?? '');
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);
  protected readonly agenda = computed(() => this.formData()?.agenda ?? []);
  protected readonly attendees = computed(() => this.formData()?.attendees ?? []);

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected locationKeyI18n = computed(() => ({
    name: 'locationKey',
    label: this.i18n().locationKey_label(),
    placeholder: this.i18n().locationKey_placeholder()
  } as TextInputI18n));

  protected meetingDateI18n = computed(() => ({
    name: 'meetingDate',
    label: this.i18n().meetingDate_label(),
    placeholder: this.i18n().meetingDate_placeholder()
  } as DateInputI18n));

  protected startTimeI18n = computed(() => ({
    name: 'startTime',
    label: this.i18n().startTime_label(),
    placeholder: this.i18n().startTime_placeholder()
  } as TimeInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** agenda/attendees are edited by their own child components and come back as whole arrays */
  protected onListChange(fieldName: 'agenda' | 'attendees', value: unknown): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

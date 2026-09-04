import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, getFullName } from '@okr/shared-util-core';

import { TripI18n, TripReport, tripReportValidations } from '@okr/trip-util';

/**
 * Collects a damage or bug report: which boat, who reports it, and what happened.
 * Replaces the former single-value prompt — a shared kiosk account cannot tell us who is reporting,
 * and a free-text boat name cannot be matched back to a resource.
 */
@Component({
  selector: 'okr-trip-report-form',
  standalone: true,
  imports: [
    SvgIconPipe, NotesInput, ErrorNote, Checkbox,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonIcon, IonButton
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>

              <!-- boat -->
              <ion-row>
                <ion-col size="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().boat() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6">
                  <ion-item lines="none">
                    @if(formData().boat; as boat) {
                      <ion-icon slot="start" src="{{'boat' | svgIcon }}" />
                      <ion-label>{{ boat.name2 }}</ion-label>
                      @if(!isReadOnly()) {
                        <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearBoat()" />
                      }
                    } @else if(!isReadOnly()) {
                      <ion-button (click)="boatSelectClicked.emit()">
                        <ion-icon slot="start" src="{{'boat' | svgIcon }}" />
                        {{ i18n().select_boat_add() }}
                      </ion-button>
                    }
                  </ion-item>
                </ion-col>
              </ion-row>

              <!-- person -->
              <ion-row>
                <ion-col size="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().person() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6">
                  <ion-item lines="none">
                    @if(formData().person; as person) {
                      <ion-icon slot="start" src="{{'person' | svgIcon }}" />
                      <ion-label>{{ personName(person.name1, person.name2) }}</ion-label>
                      @if(!isReadOnly()) {
                        <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearPerson()" />
                      }
                    } @else if(!isReadOnly()) {
                      <ion-button (click)="personSelectClicked.emit()">
                        <ion-icon slot="start" src="{{'person' | svgIcon }}" />
                        {{ i18n().select_participant_add() }}
                      </ion-button>
                    }
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-error-note [errors]="personErrors()" />
                </ion-col>
              </ion-row>

            </ion-grid>
          </ion-card-content>
        </ion-card>

        <okr-notes-input [i18n]="messageI18n()" [value]="message()"
          (valueChange)="onMessageChange($event)" [readOnly]="isReadOnly()" [errors]="messageErrors()" />

        @if (canLockBoat()) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <okr-checkbox [i18n]="lockBoatI18n()" [checked]="lockBoat()"
                      (checkedChange)="onLockBoatChange($event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `
})
export class TripReportForm {
  // inputs
  public readonly i18n = input.required<TripI18n>();
  public formData = model.required<TripReport>();
  public readonly reportType = input.required<'damage' | 'bug'>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly boatSelectClicked = output<void>();
  public readonly personSelectClicked = output<void>();

  // signal form — wraps formData with Vest validation
  protected readonly reportForm = form(this.formData, (path) =>
    validateVestTree(path, tripReportValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.reportForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly message = computed(() => this.formData()?.message ?? '');
  protected readonly personName = getFullName;

  protected messageI18n = computed(() => ({
    name: 'message',
    label: this.i18n().report_message_label(),
    placeholder: this.reportType() === 'damage' ? this.i18n().report_damage_prompt() : this.i18n().report_bug_prompt()
  } as NotesInputI18n));

  /** only a damage report on a known boat can lock it — a bug report has nothing to lock */
  protected readonly canLockBoat = computed(() => this.reportType() === 'damage' && !!this.formData()?.boat);
  protected readonly lockBoat = computed(() => this.formData()?.lockBoat ?? false);
  protected lockBoatI18n = computed(() => ({
    name: 'lockBoat',
    label: this.i18n().report_lock_boat_label(),
    helper: this.i18n().report_lock_boat_helper(),
  } as CheckboxI18n));

  // validation and errors
  private readonly validationResult = computed(() => tripReportValidations(this.formData()));
  protected personErrors = computed(() => this.validationResult().getErrors('person'));
  protected messageErrors = computed(() => this.validationResult().getErrors('message'));

  /******************************* actions *************************************** */
  protected onMessageChange(message: string): void {
    this.onFieldChange({ message });
  }

  protected onLockBoatChange(lockBoat: boolean): void {
    this.onFieldChange({ lockBoat });
  }

  protected clearBoat(): void {
    // dropping the boat hides the checkbox — reset lockBoat too, so a newly picked boat
    // doesn't inherit a tick meant for the previous one
    this.onFieldChange({ boat: undefined, lockBoat: false });
  }

  protected clearPerson(): void {
    this.onFieldChange({ person: undefined });
  }

  private onFieldChange(patch: Partial<TripReport>): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, ...patch } as TripReport));
  }
}

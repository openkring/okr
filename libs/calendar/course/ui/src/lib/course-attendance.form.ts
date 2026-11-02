import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonLabel, IonNote, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular';

import { AttendanceFormModel, AttendanceRow, CourseI18n, courseAttendanceValidations } from '@okr/calendar-course-util';
import { AttendanceEntry, NameDisplay } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, ErrorNote } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, getFullName } from '@okr/shared-util-core';

/**
 * The attendance of one course event (spec 1.132 §7.3): one row per person of the course table with the sign-up
 * (small), the presence (present / absent / excused) and the function (leads or not). The rows start from what is
 * stored, else from the prefill; the parent saves all rows with the change-confirmation.
 */
@Component({
  selector: 'okr-course-attendance-form',
  standalone: true,
  imports: [Checkbox, ErrorNote, SvgIconPipe, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonLabel, IonNote, IonIcon, IonSegment, IonSegmentButton],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .row { border-bottom: 1px solid var(--ion-color-light-shade); }
    .name { display: flex; align-items: center; gap: 6px; min-height: 44px; }
    .sign-up { font-size: 0.8em; color: var(--ion-color-medium); }
    .trainer { width: 14px; height: 14px; color: var(--ion-color-warning); }
    .changed { font-weight: bold; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (intro()) {
                <ion-row><ion-col size="12"><ion-note>{{ intro() }}</ion-note></ion-col></ion-row>
              }
              @for (row of rows(); track row.person.key; let i = $index) {
                <ion-row class="row ion-align-items-center">
                  <ion-col size="12" size-md="4">
                    <div class="name">
                      @if (row.isTrainer) {
                        <ion-icon class="trainer" src="{{ 'star' | svgIcon }}" [title]="i18n().table_leader()" />
                      }
                      <ion-label [class.changed]="isChanged(row)">{{ personName(row) }}</ion-label>
                      @if (signUpLabel(row); as signUp) {
                        <span class="sign-up">({{ signUp }})</span>
                      }
                    </div>
                  </ion-col>
                  <ion-col size="12" size-md="5">
                    <ion-segment [value]="row.presence" (ionChange)="onPresenceChange(i, $event.detail.value)" [disabled]="isReadOnly()">
                      <ion-segment-button value="present"><ion-label>{{ i18n().table_present() }}</ion-label></ion-segment-button>
                      <ion-segment-button value="absent"><ion-label>{{ i18n().table_absent() }}</ion-label></ion-segment-button>
                      <ion-segment-button value="excused"><ion-label>{{ i18n().table_excused() }}</ion-label></ion-segment-button>
                    </ion-segment>
                  </ion-col>
                  <ion-col size="12" size-md="3">
                    <okr-checkbox [i18n]="leaderI18n()" [checked]="row.function === 'leader'" [toggle]="true"
                      (checkedChange)="onLeaderChange(i, $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
            <okr-error-note [errors]="rowsErrors()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class CourseAttendanceForm {
  // inputs
  public readonly formData = model.required<AttendanceFormModel>();
  public readonly i18n = input.required<CourseI18n>();
  /** a line above the rows (e.g. who confirmed when); '' = none */
  public readonly intro = input('');
  /** the viewer's person display order, as on the course table */
  public readonly nameDisplay = input<NameDisplay>(NameDisplay.FirstLast);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset the Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly attendanceForm = form(this.formData, (path) => validateVestTree(path, courseAttendanceValidations as any));
  private readonly validationResult = vestErrors(this.attendanceForm);
  protected readonly rowsErrors = computed(() => this.validationResult().getErrors('rows'));

  protected readonly rows = computed(() => this.formData().rows ?? []);
  protected readonly leaderI18n = computed(() => ({ name: 'function', label: this.i18n().attendance_leader(), helper: '' } as CheckboxI18n));

  constructor() {
    effect(() => this.valid.emit(this.attendanceForm().valid()));
  }

  protected personName(row: AttendanceRow): string {
    return getFullName(row.person.name1, row.person.name2, this.nameDisplay());
  }

  protected signUpLabel(row: AttendanceRow): string {
    switch (row.signUp) {
      case 'accepted': return this.i18n().table_signUp_accepted();
      case 'declined': return this.i18n().table_signUp_declined();
      case 'invited': return this.i18n().table_signUp_invited();
      default: return '';
    }
  }

  /** differs from what is stored (or nothing is stored yet): these rows are written as corrections */
  protected isChanged(row: AttendanceRow): boolean {
    return !!row.stored && (row.stored.presence !== row.presence || row.stored.function !== row.function);
  }

  /******************************* actions *************************************** */
  protected onPresenceChange(index: number, value: unknown): void {
    if (value !== 'present' && value !== 'absent' && value !== 'excused') return;
    this.updateRow(index, row => row.presence === value ? row : { ...row, presence: value as AttendanceEntry['presence'] });
  }

  protected onLeaderChange(index: number, leads: boolean): void {
    const fn: AttendanceEntry['function'] = leads ? 'leader' : 'participant';
    this.updateRow(index, row => row.function === fn ? row : { ...row, function: fn });
  }

  private updateRow(index: number, change: (row: AttendanceRow) => AttendanceRow): void {
    const before = this.rows()[index];
    if (!before) return;
    const after = change(before);
    if (after === before) return;   // ion-segment echoes the bound value on render: not an edit
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, rows: (vm.rows ?? []).map((r, i) => i === index ? after : r) }));
  }
}

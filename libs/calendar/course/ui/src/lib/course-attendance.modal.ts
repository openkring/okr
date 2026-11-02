import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { AttendanceFormModel, AttendanceRow, COURSE_I18N_KEYS, CourseI18n } from '@okr/calendar-course-util';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { CourseAttendanceForm } from './course-attendance.form';

/**
 * Confirm the attendance of one course event (spec 1.132 §7.3): header + change-confirmation + the attendance form.
 * Dismisses with role `'confirm'` and the edited rows; the caller (`CourseTableStore.confirmAttendance`) writes them.
 *
 * An event that nobody confirmed yet opens dirty: the prefill is a proposal that has to be SAVED to count (D12), so
 * the banner is there from the start and saving the unchanged rows is the confirmation.
 */
@Component({
  selector: 'okr-course-attendance-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, CourseAttendanceForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-course-attendance-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [intro]="intro()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class CourseAttendanceModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal
  protected readonly i18n = inject(I18nService).translateAll(COURSE_I18N_KEYS) as CourseI18n;

  // inputs
  public readonly rows = input.required<AttendanceRow[]>();
  /** «Mo 03.11.2026 18:00» — the event the rows belong to */
  public readonly eventTitle = input('');
  /** the event has a confirmation already: saving then writes the corrections only */
  public readonly confirmed = input(false);
  /** «Bestätigt von … am …», or the intro for a first confirmation */
  public readonly intro = input('');
  public readonly readOnly = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // state
  protected readonly formData = linkedSignal<AttendanceFormModel>(() => ({ rows: safeStructuredClone(this.rows()) ?? [] }));
  protected readonly formDirty = linkedSignal(() => !this.confirmed() && !this.isReadOnly());
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(), save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));
  protected readonly headerTitle = computed(() => {
    const title = this.i18n.attendance_title();
    return this.eventTitle() ? `${title} ${this.eventTitle()}` : title;
  });

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData().rows, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(!this.confirmed() && !this.isReadOnly());
    this.formData.set({ rows: safeStructuredClone(this.rows()) ?? [] });
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: AttendanceFormModel): void {
    this.formData.set(formData);
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { safeStructuredClone } from '@okr/shared-util-core';
import { dismissOverlay } from '@okr/shared-util-angular';

import { TripReportForm } from '@okr/trip-ui';
import { newTripReport, TripReport } from '@okr/trip-util';
import { TripStore } from './trip.store';

/**
 * Modal for a damage ('Schadenmeldung') or bug ('Fehlermeldung') report.
 * Dismisses with the filled TripReport and role 'confirm', or without data when cancelled.
 */
@Component({
  selector: 'okr-trip-report-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, TripReportForm,
    IonContent
  ],
  providers: [TripStore],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <okr-trip-report-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [reportType]="reportType()"
          [showForm]="showForm()"
          [i18n]="store.i18n"
          (boatSelectClicked)="selectBoat()"
          (personSelectClicked)="selectPerson()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class TripReportModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(TripStore);

  // inputs
  public readonly reportType = input.required<'damage' | 'bug'>();
  /** prefilled from the trip's boat; unset when the report is not about a specific trip */
  public readonly boat = input<AvatarInfo | undefined>();
  /** prefilled with the current user; unset on the kiosk, where the account is shared */
  public readonly person = input<AvatarInfo | undefined>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  private readonly report = computed(() => newTripReport(this.boat(), this.person()));
  public formData = linkedSignal(() => safeStructuredClone(this.report()));

  // derived
  protected readonly headerTitle = computed(() =>
    this.reportType() === 'damage' ? this.store.i18n.report_damage() : this.store.i18n.report_bug());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.store.i18n.cancel(),
    save: this.store.i18n.save(),
  } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.report()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected async selectBoat(): Promise<void> {
    // the report's own picker: no in-use check and no rigging question — a damaged boat is often still out
    const boat = await this.store.selectBoatForReport();
    if (!boat) return;
    this.onFieldChange({ boat });
  }

  protected async selectPerson(): Promise<void> {
    const person = await this.store.selectPersonAvatar();
    if (!person) return;
    this.onFieldChange({ person });
  }

  protected onFormDataChange(formData: TripReport): void {
    this.formData.set(formData);
  }

  private onFieldChange(patch: Partial<TripReport>): void {
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, ...patch } as TripReport));
  }
}

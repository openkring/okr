import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { newBooksSetupInput, type BooksSetupInput, type FeaturePickerI18n } from '@okr/tenant-util';

import { BooksSetupForm } from './books-setup.form';

/**
 * «Buchhaltung einrichten» — opened by `FeaturePicker` right after `finance` is switched on, and from the
 * finance row while no default books exist. Prefilled with a valid answer (the tenant's own id and name,
 * calendar year, no VAT), so the bar shows from the start. Dismisses with the `BooksSetupInput` and role
 * 'confirm'; the picker sends it to the `setupBooks` verb.
 */
@Component({
  selector: 'okr-books-setup-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, ChangeConfirmation, BooksSetupForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().books_title() }" [isModal]="true" />
    @if (formValid()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]="formDirty()"
        (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-books-setup-form [formData]="formData()" (formDataChange)="formData.set($event)"
        [i18n]="i18n()" [showForm]="showForm()" (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
    </ion-content>
  `,
})
export class BooksSetupModal {
  private readonly modalController = inject(ModalController);

  public readonly i18n = input.required<FeaturePickerI18n>();
  public readonly tenantId = input.required<string>();
  /** The tenant's display name — the default name of the org that keeps the books. */
  public readonly tenantName = input('');

  private readonly initial = computed(() => newBooksSetupInput(this.tenantId(), this.tenantName() || this.tenantId()));
  protected readonly formData = linkedSignal<BooksSetupInput>(() => this.initial());
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(true);
  protected readonly showForm = signal(true);

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().books_save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    const data = this.formData();
    await dismissOverlay(this.modalController, { ...data, name: data.name.trim() }, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initial());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}

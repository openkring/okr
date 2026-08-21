import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { InstrumentModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { INSTRUMENTS_I18N_KEYS } from '@okr/instruments-util';
import { InstrumentForm } from '@okr/instruments-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

/**
 * The instrument-metadata editor (name + description). The board itself is the detail page; this
 * modal only creates/renames the instrument. Does not inject the store (no store-DI contract).
 */
@Component({
  selector: 'okr-instrument-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, InstrumentForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as data) {
        <okr-instrument-form
          [i18n]="i18n"
          [formData]="data"
          (formDataChange)="onFormDataChange($event)"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class InstrumentEditModal {
  private readonly modalController = inject(ModalController);
  private readonly i18nService = inject(I18nService);

  public readonly instrument = input.required<InstrumentModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tags = input('');
  public readonly tenantId = input.required<string>();
  public readonly readOnly = input(true);

  protected readonly i18n = this.i18nService.translateAll(INSTRUMENTS_I18N_KEYS);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.instrument()));

  protected readonly title = computed(() => (this.isReadOnly() ? this.i18n.view() : (this.instrument().name || this.i18n.create())));
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));

  protected onFormDataChange(data: InstrumentModel): void {
    this.formData.set(data);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.instrument()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent, ModalController } from '@ionic/angular';
import { Observable } from 'rxjs';

import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, FormDefinitionModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';
import { FORM_I18N_KEYS, FormI18n } from '@okr/forms-util';

import { FormDefinitionForm } from './form-definition.form';

/**
 * Creates or edits the settings of a form definition.
 * Dismisses with the edited FormDefinitionModel and role 'confirm'; the caller persists it.
 */
@Component({
  selector: 'okr-form-definition-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, FormDefinitionForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-form-definition-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [mode]="mode()"
          [categories]="categories()"
          [responseCount]="responseCount()"
          [readOnly]="false"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class FormDefinitionEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(FORM_I18N_KEYS) as FormI18n;

  // inputs
  public readonly form = input.required<FormDefinitionModel>();
  public readonly mode = input.required<'create' | 'edit'>();
  /** the tenant's category lists, for conditions on a category field in the «Berechnete Werte» */
  public readonly categories = input<CategoryListModel[]>([]);
  /** the live count of accepted responses (`FormDefinitionService.readResponseCount`), for «7 von 8 Antworten»; edit only */
  public readonly responseCount$ = input<Observable<number> | undefined>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => this.cloneForm());
  protected showForm = signal(true);

  // the count follows the form while the modal is open; unknown (null) until the first value, or without a source
  private readonly countResource = rxResource({
    params: () => this.responseCount$(),
    stream: ({ params }) => params,
  });
  protected readonly responseCount = computed(() => (this.countResource.hasValue() ? this.countResource.value() : null));

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly title = computed(() =>
    this.mode() === 'create' ? this.i18n.def_create_title() : this.i18n.def_edit_title());
  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: this.i18n.cancel(), save: this.i18n.save(),
  }));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.cloneForm());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: FormDefinitionModel): void {
    this.formData.set(formData);
  }

  private cloneForm(): FormDefinitionModel {
    return safeStructuredClone(this.form()) ?? this.form();
  }
}

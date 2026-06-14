import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, SectionModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, ErrorBanner, Header} from '@bk2/shared-ui';
import { coerceBoolean, deepEqual, safeStructuredClone } from '@bk2/shared-util-core';
import { SectionForm } from '@bk2/cms-section-ui';

import { SectionStore } from './section.store';


/**
 * This modal is used to edit a SectionModel.
 * `dirty` is derived from a deep comparison of initial vs current form data, while validity
 * comes from the per-type vest suite run inside SectionForm (emitted via its `valid` output).
 * The save action is only offered when the form is both dirty and valid.
 */
@Component({
    selector: 'bk-section-edit-modal',
    standalone: true,
    imports: [
      ChangeConfirmation, Header, ErrorBanner, SectionForm,
      IonContent
    ],
    template: `
      <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
      @if(formDirty() && formValid() && formData()) {
        <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
      }
      <bk-error-banner [message]="store.errorMessage()" (dismiss)="store.clearError()" />
      <ion-content class="ion-no-padding">
        @if(formData(); as formData) {
          <bk-section-form
            [i18n]="store.i18n"
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser()"
            [showForm]="showForm()"
            [roles]="roles()"
            [states]="states()"
            [allTags]="tags()"
            [tenantId]="tenantId()"
            [readOnly]="isReadOnly()"
            (valid)="formValid.set($event)"
          />
        }
      </ion-content>
  `
})
export class SectionEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(SectionStore);

  // inputs
  public section = input.required<SectionModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public roles = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected initialData = signal<SectionModel | undefined>(undefined);
  protected formDirty = linkedSignal(() => {
    const fd = this.formData();
    return fd ? !fd.bkey || fd.bkey.length === 0 : false;
  });
  protected formData = linkedSignal(() => safeStructuredClone(this.section()));
  protected formValid = signal(true);
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.section().bkey));
  protected tenantId = computed(() => this.store.tenantId());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  constructor() {
    effect(() => {
      const orig = this.section();
      this.initialData.set(safeStructuredClone(orig));
    });
    effect(() => {
      const current = this.formData();
      const initial = this.initialData();
      if (initial && !deepEqual(current, initial)) {
        this.formDirty.set(true);
      } else {
        this.formDirty.set(false);
      }
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formData.set(safeStructuredClone(this.section()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update(vm => vm ? { ...vm, [fieldName]: fieldValue } : vm);
  }

  protected onFormDataChange(formData: SectionModel): void {
    this.formData.set(formData);
  }
}

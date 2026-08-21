import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, UserModel, WorkflowRuleModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { DEFAULT_TAGS } from '@okr/shared-constants';

import { ResponsibilityOption, WORKFLOW_I18N_KEYS, WorkflowI18n } from '@okr/system-workflow-util';
import { dismissOverlay } from '@okr/shared-util-angular';

import { WorkflowRuleForm } from './workflow-rule.form';

@Component({
  selector: 'okr-workflow-rule-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, WorkflowRuleForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <okr-workflow-rule-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [eventCategory]="eventCategory()"
          [probeCategory]="probeCategory()"
          [actionCategory]="actionCategory()"
          [responsibilities]="responsibilities()"
          [allTags]="allTags()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class WorkflowRuleEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(WORKFLOW_I18N_KEYS) as WorkflowI18n;

  // inputs
  public readonly rule = input.required<WorkflowRuleModel>();
  public readonly currentUser = input<UserModel | undefined>();
  // resolved by the store (AppStore.getCategory) — see the note in the form
  public readonly eventCategory = input.required<CategoryListModel>();
  public readonly probeCategory = input.required<CategoryListModel>();
  public readonly actionCategory = input.required<CategoryListModel>();
  public readonly responsibilities = input<ResponsibilityOption[]>([]);
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.rule()));
  protected showForm = signal(true);

  // derived
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view_label();
    return this.rule().okey ? this.i18n.edit_label() : this.i18n.create_label();
  });
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.rule()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(rule: WorkflowRuleModel): void {
    this.formData.set(rule);
  }
}

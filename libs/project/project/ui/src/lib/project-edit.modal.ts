import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { DEFAULT_TAGS } from '@okr/shared-constants';
import { CategoryListModel, ProjectModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { ProjectI18n } from '@okr/project-project-util';

import { ProjectForm } from './project.form';

/**
 * Edits one project: header + change-confirmation + `okr-project-form`. Presentational: it injects
 * no store or service; the opener persists what this dismisses with role 'confirm'.
 */
@Component({
  selector: 'okr-project-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, ProjectForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-project-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()"
          [currentUser]="currentUser()"
          [allTags]="allTags()"
          [states]="states()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class ProjectEditModal {
  private readonly modalController = inject(ModalController);

  // inputs (componentProps)
  public readonly project = input.required<ProjectModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly i18n = input.required<ProjectI18n>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly states = input.required<CategoryListModel>();
  public readonly readOnly = input(false);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly showForm = signal(true);
  public readonly formData = linkedSignal(() => safeStructuredClone(this.project()));

  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n().cancel(), save: this.i18n().save() } as ChangeConfirmationI18n));
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n().view();
    return this.project().okey ? this.i18n().update() : this.i18n().create();
  });

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.project()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: ProjectModel): void {
    this.formData.set(formData);
  }
}

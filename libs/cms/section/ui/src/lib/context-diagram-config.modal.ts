import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { ContextDiagramConfig, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';
import { ContextDiagramConfigFormModel, newContextDiagramConfigFormModel, SECTION_I18N_KEYS, SectionI18n } from '@okr/cms-section-util';

import { ContextDiagramConfigForm } from './context-diagram-config.form';

/**
 * Display settings of a context diagram.
 * Dismisses with `{ ...config, _saveChanges }` and role 'confirm'; the caller applies the config
 * and persists it to the section when a member admin switched on "save".
 */
@Component({
  selector: 'okr-context-diagram-config-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, ContextDiagramConfigForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.context_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-context-diagram-config-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [isMemberAdmin]="isMemberAdmin()"
          [readOnly]="false"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class ContextDiagramConfigModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: only the labels are needed
  protected readonly i18n = inject(I18nService).translateAll(SECTION_I18N_KEYS) as SectionI18n;

  // inputs
  public readonly config = input.required<ContextDiagramConfig>();
  public readonly currentUser = input<UserModel | undefined>(undefined);

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => newContextDiagramConfigFormModel(this.config()));
  protected showForm = signal(true);

  // derived
  protected readonly isMemberAdmin = computed(() => hasRole('memberAdmin', this.currentUser()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: this.i18n.cancel(), save: this.i18n.ok(),
  }));

  public async save(): Promise<void> {
    const { saveChanges, ...config } = this.formData();
    await dismissOverlay(this.modalController, { ...config, _saveChanges: saveChanges }, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(newContextDiagramConfigFormModel(this.config()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: ContextDiagramConfigFormModel): void {
    this.formData.set(formData);
  }
}

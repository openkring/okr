// libs/content/pdf-template/ui/src/lib/template-publish.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { newTemplatePublishFormModel, TEMPLATE_I18N_KEYS, TemplateI18n, TemplatePublishFormModel } from '@okr/content-pdf-template-util';

import { TemplatePublishForm } from './template-publish.form';

/** Asks for the changelog of version N; dismisses with `{ changelog }` and role 'confirm'. */
@Component({
  selector: 'okr-template-publish-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, ChangeConfirmation, TemplatePublishForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: publishTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-template-publish-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class TemplatePublishModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(TEMPLATE_I18N_KEYS) as TemplateI18n;

  public readonly versionNum = input<number>(1);

  protected readonly publishTitle = computed(() => fill(this.i18n.publish_title(), { version: this.versionNum() }));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData = signal<TemplatePublishFormModel>(newTemplatePublishFormModel());
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.publish(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, { changelog: this.formData().changelog.trim() }, 'confirm');
  }

  protected onFormDataChange(formData: TemplatePublishFormModel): void {
    this.formData.set(formData);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(newTemplatePublishFormModel());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}

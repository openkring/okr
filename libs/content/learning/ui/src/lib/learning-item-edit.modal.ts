import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';
import { LEARNING_I18N_KEYS, LearningI18n, LearningItemFormData } from '@okr/content-learning-util';

import { LearningAttachmentInfo, LearningItemForm } from './learning-item.form';

/** Picks (or uploads) one document to attach; undefined when the user cancelled. */
export type LearningAttachmentPicker = () => Promise<LearningAttachmentInfo | undefined>;

const EMPTY_ITEM: LearningItemFormData = { title: '', tags: '', notes: '', links: [], attachmentKeys: [] };

/**
 * Edits a learning item (spec 1.115 §5.3) and dismisses with the edited {@link LearningItemFormData}
 * and role 'confirm'. Saving is the caller's job. Adding an attachment calls `attachmentPicker`,
 * which the feature provides (document picker or upload) — this modal stays presentational.
 */
@Component({
  selector: 'okr-learning-item-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, LearningItemForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.itemForm_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-learning-item-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [curatableTopics]="curatableTopics()"
          [attachments]="knownAttachments()"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          (pickAttachment)="onPickAttachment()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class LearningItemEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: a feature store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(LEARNING_I18N_KEYS) as LearningI18n;

  // inputs
  public readonly item = input<LearningItemFormData>(EMPTY_ITEM);
  /** the room topics the actor may curate */
  public readonly curatableTopics = input<string[]>([]);
  /** titles of the documents already attached */
  public readonly attachments = input<LearningAttachmentInfo[]>([]);
  public readonly attachmentPicker = input<LearningAttachmentPicker | undefined>(undefined);
  public readonly readOnly = input(false);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData = linkedSignal<LearningItemFormData>(() => this.initial());
  protected showForm = signal(true);
  /** the given attachments plus those picked while the modal is open */
  protected readonly knownAttachments = linkedSignal<LearningAttachmentInfo[]>(() => this.attachments());

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.form_cancel(),
    save: this.i18n.form_save(),
  } as ChangeConfirmationI18n));

  private initial(): LearningItemFormData {
    return { ...EMPTY_ITEM, ...safeStructuredClone(this.item()) };
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  protected onFormDataChange(formData: LearningItemFormData): void {
    this.formData.set(formData);
  }

  protected async onPickAttachment(): Promise<void> {
    const picker = this.attachmentPicker();
    if (!picker) return;
    const picked = await picker();
    if (!picked) return;
    const keys = this.formData().attachmentKeys ?? [];
    if (keys.includes(picked.key)) return;
    this.knownAttachments.update(list => [...list.filter(a => a.key !== picked.key), picked]);
    this.formData.update(vm => ({ ...vm, attachmentKeys: [...keys, picked.key] }));
    this.formDirty.set(true);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initial());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}

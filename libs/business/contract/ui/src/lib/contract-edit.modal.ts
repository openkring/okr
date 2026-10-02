import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { DEFAULT_TAGS } from '@okr/shared-constants';
import { AvatarInfo, ContractModel, UserModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { ContractDocumentService } from '@okr/business-contract-data-access';
import { CONTRACT_I18N_KEYS, ContractI18n } from '@okr/business-contract-util';

import { ContractForm, ContractSelectTarget } from './contract.form';

/**
 * Edits one contract. Dismisses `role: 'confirm'` with the edited model; persisting (and the derived
 * fields) is the store's job.
 *
 * Person/org pickers live in @okr/shared-feature, which a ui lib must not import — and a modal
 * opened by the store must not inject that store back (memory: store-modal-dynamic-import). The
 * store therefore passes its pickers in as callbacks (`selectPerson`, `selectOrg`), like the diary
 * edit modal does.
 */
@Component({
  selector: 'okr-contract-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, ContractForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-contract-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n" [currentUser]="currentUser()" [tenantId]="tenantId()" [allTags]="allTags()"
          [readOnly]="isReadOnly()" [showForm]="showForm()"
          [summarizing]="summarizing()" [summarizeError]="summarizeError()"
          (selectClicked)="onSelect($event)" (summarizeClicked)="summarize()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class ContractEditModal {
  private readonly modalController = inject(ModalController);
  private readonly documentService = inject(ContractDocumentService);
  protected readonly i18n = inject(I18nService).translateAll(CONTRACT_I18N_KEYS) as ContractI18n;

  // inputs (componentProps)
  public readonly contract = input.required<ContractModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly selectPerson = input<() => Promise<AvatarInfo | undefined>>();
  public readonly selectOrg = input<() => Promise<AvatarInfo | undefined>>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.contract()) as ContractModel);
  protected showForm = signal(true);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected summarizing = signal(false);
  protected summarizeError = signal('');

  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.contract().okey ? this.i18n.edit() : this.i18n.add();
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(), save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  /** The form asked for a person/org; run the store's picker and apply the result. */
  protected async onSelect(target: ContractSelectTarget): Promise<void> {
    const pick = target === 'partyOrg' ? this.selectOrg() : this.selectPerson();
    const avatar = await pick?.();
    if (!avatar) return;
    if (target === 'responsible') {
      this.apply({ responsible: avatar });
    } else {
      const parties = this.formData().parties ?? [];
      if (parties.some((p) => p.avatar.modelType === avatar.modelType && p.avatar.key === avatar.key && !!avatar.key)) return;
      this.apply({ parties: [...parties, { role: 'counterparty', avatar }] });
    }
  }

  /** On-demand AI abstract (spec 1.5 §7.3). The form hides the button for strictly confidential or unsaved contracts. */
  protected async summarize(): Promise<void> {
    const c = this.formData();
    if (!c.okey || c.confidentiality === 'strictlyConfidential') return;
    this.summarizing.set(true);
    this.summarizeError.set('');
    try {
      const { abstract } = await this.documentService.summarize(c.okey);
      this.apply({ abstract, abstractSource: 'ai' });
    } catch (error) {
      console.error('ContractEditModal.summarize', error);
      this.summarizeError.set(this.i18n.summarizeError());
    } finally {
      this.summarizing.set(false);
    }
  }

  private apply(patch: Partial<ContractModel>): void {
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, ...patch }));
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.summarizeError.set('');
    this.formData.set(safeStructuredClone(this.contract()) as ContractModel);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: ContractModel): void {
    this.formData.set(formData);
  }
}

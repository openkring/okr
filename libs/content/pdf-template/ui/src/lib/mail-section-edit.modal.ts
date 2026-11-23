// libs/content/pdf-template/ui/src/lib/mail-section-edit.modal.ts
//
// Edits one section of a Versand page (spec 1.172 §7.2): an article's title and images, a button, an events
// section. It wraps the CMS section form (`okr-section-form` from cms-section-ui) and only dismisses with the
// edited section; the page editor writes it.
//
// Why not the CMS `SectionEditModal`: it lives in `cms-section-feature`, which this `ui` lib may not import
// (type:ui → type:feature), and the composer's only opener (`bulk-email.ts` in pdf-template-feature) cannot
// either: cms-section-feature already depends on pdf-template-feature (people section → person store →
// bulk-email), so the import would close a cycle. The CMS modal's extras (section store, contracts, forms,
// courses, locations) do not apply to the three mail section types anyway.
//
// Loaded with a dynamic import only (see mail-page-editor.ts): the section form and all its configurations stay
// out of the composer's chunk. Not exported from the lib's barrel for the same reason.
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { CategoryListModel, SectionModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { deepEqual, safeStructuredClone } from '@okr/shared-util-core';
import { dismissOverlay } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import { APP_STORE_MIN } from '@okr/shared-data-access';
import { SECTION_I18N_KEYS, SectionI18n, withImageStyleDefaults } from '@okr/cms-section-util';
import { SectionForm } from '@okr/cms-section-ui';
import { EmailComposerI18n } from '@okr/content-pdf-template-util';

@Component({
  selector: 'okr-mail-section-edit-modal',
  standalone: true,
  imports: [ChangeConfirmation, Header, SectionForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().page_edit_title() }" [isModal]="true" />
    @if (formDirty() && formValid()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-section-form
          [i18n]="sectionI18n"
          [formData]="formData"
          (formDataChange)="formData$.set($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [roles]="noCategory"
          [states]="noCategory"
          [albumStyles]="noCategory"
          [allTags]="''"
          [tenantId]="tenantId()"
          [linkOrigins]="linkOrigins()"
          [readOnly]="false"
          [journalMode]="false"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class MailSectionEditModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(APP_STORE_MIN);
  protected readonly sectionI18n = inject(I18nService).translateAll(SECTION_I18N_KEYS) as SectionI18n;

  // inputs
  public readonly section = input.required<SectionModel>();
  public readonly i18n = input.required<EmailComposerI18n>();

  protected readonly tenantId = computed(() => this.appStore.tenantId());
  protected readonly currentUser = computed(() => this.appStore.currentUser() ?? new UserModel(this.tenantId()));
  protected readonly linkOrigins = computed(() => [this.appStore.appOrigin()].filter((o) => !!o));
  /** A mail section has no role or state to choose from (the page is never shown in the app). */
  protected readonly noCategory = new CategoryListModel(this.appStore.tenantId());

  private readonly initial = computed(() => withImageStyleDefaults(safeStructuredClone(this.section())));
  protected readonly formData$ = linkedSignal(() => this.initial());
  protected readonly formData = this.formData$.asReadonly();
  protected readonly formValid = signal(false);
  protected readonly formDirty = computed(() => !deepEqual(this.formData(), this.initial()));
  protected readonly showForm = signal(true);
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().page_revert(), save: this.i18n().page_apply(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formData$.set(this.initial());
    this.showForm.set(false);          // re-mount the form so its field state starts fresh
    setTimeout(() => this.showForm.set(true), 0);
  }
}

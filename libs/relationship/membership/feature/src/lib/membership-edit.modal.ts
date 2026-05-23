import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, CategoryListModel, MembershipModel, MembershipModelName, PrivacySettings, RoleName, UserModel } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, getFullName, hasRole, newAvatarInfo, safeStructuredClone } from '@bk2/shared-util-core';
import { AppStore } from '@bk2/shared-feature';
import { signalStore, withProps } from '@ngrx/signals';

import { CommentsAccordion } from '@bk2/comment-feature';
import { DocumentsAccordion } from '@bk2/document-feature';

import { MembershipForm } from '@bk2/relationship-membership-ui';
import { RelationshipToolbar } from '@bk2/avatar-ui';
import { PFX } from './scope';

const UI = '@relationship/membership/ui.';

const MembershipEditModalStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      // ChangeConfirmation keys
      changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
      changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
      changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
      // MembershipForm keys
      selectLabel:                    UI + 'newDesc',
      newDesc:                        UI + 'newDesc',
      categoryLabel:                  UI + 'category.label',
      categoryHelper:                 UI + 'category.helper',
      categoryName:                   UI + 'category.label',
      memberStateLabel:               UI + 'memberState',
      stateHelper:                    UI + 'state.helper',
      bkey_label:                     UI + 'bkey.label',
      memberId_label:                 UI + 'memberId.label',
      memberId_placeholder:           UI + 'memberId.placeholder',
      memberId_helper:                UI + 'memberId.helper',
      memberBexioId_label:            UI + 'memberBexioId.label',
      memberBexioId_placeholder:      UI + 'memberBexioId.placeholder',
      memberBexioId_helper:           UI + 'memberBexioId.helper',
      memberAbbreviation_label:       UI + 'memberAbbreviation.label',
      memberAbbreviation_placeholder: UI + 'memberAbbreviation.placeholder',
      memberAbbreviation_helper:      UI + 'memberAbbreviation.helper',
      memberNickName_label:           UI + 'memberNickName.label',
      memberNickName_placeholder:     UI + 'memberNickName.placeholder',
      memberNickName_helper:          UI + 'memberNickName.helper',
      orgFunction_label:              UI + 'orgFunction.label',
      orgFunction_placeholder:        UI + 'orgFunction.placeholder',
      orgFunction_helper:             UI + 'orgFunction.helper',
      rebate_label:                   UI + 'rebate.label',
      rebate_placeholder:             UI + 'rebate.placeholder',
      rebate_helper:                  UI + 'rebate.helper',
      notes_label:                    UI + 'notes.label',
      notes_placeholder:              UI + 'notes.placeholder',
      dateOfEntry_label:              UI + 'dateOfEntry.label',
      dateOfEntry_placeholder:        UI + 'dateOfEntry.placeholder',
      dateOfEntry_helper:             UI + 'dateOfEntry.helper',
      dateOfExit_label:               UI + 'dateOfExit.label',
      dateOfExit_placeholder:         UI + 'dateOfExit.placeholder',
      dateOfExit_helper:              UI + 'dateOfExit.helper',
      rebateReason_label:             UI + 'rebateReason.label',
    } satisfies Record<string, string>),
  })),
);

@Component({
  selector: 'bk-membership-edit-modal',
  standalone: true,
  providers: [MembershipEditModalStore],
  imports: [
    CommentsAccordion, MembershipForm, RelationshipToolbar, Header,
    ChangeConfirmation, DocumentsAccordion,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">

      @if(currentUser(); as currentUser) {
        <bk-relationship-toolbar
          relType="membership"
          [subjectAvatar]="memberAvatar()"
          [objectAvatar]="orgAvatar()"
          [currentUser]="currentUser"
        />
        @if(currentMcat(); as mcat) {
          @if(formData(); as formData) {
            <bk-membership-form
              [formData]="formData"
              (formDataChange)="onFormDataChange($event)"
              [currentUser]="currentUser"
              [membershipCategories]="mcat"
              [allTags]="tags()"
              [readOnly]="isReadOnly()"
              [priv]="priv()"
              [i18n]="store.i18n"
              (dirty)="manualDirty.set($event)"
              (valid)="formValid.set($event)"
            />
          }
        }
      }

      @if(hasRole('privileged') && !isReadOnly() && !isNew()) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class MembershipEditModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  protected readonly store = inject(MembershipEditModalStore);

  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  // inputs
  public membership = input.required<MembershipModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public priv = input.required<PrivacySettings>();
  public mcat = input.required<CategoryListModel>();
  public isNew = input.required<boolean>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.membership()));
  protected showForm = signal(true);
  protected formDirty = computed(() => {
    // Always dirty for new memberships, or when explicitly set
    return this.isNew() || this.manualDirty();
  });
  protected manualDirty = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());

  // derived signals
  protected headerTitle = computed(() => this.isReadOnly() ? '@membership.operation.view.label' : '@membership.operation.update.label');
  protected readonly parentKey = computed(() => `${MembershipModelName}.${this.memberKey()}`);
  protected readonly name = computed(() => { const m = this.formData() ?? this.membership(); return getFullName(m.memberName1, m.memberName2, this.currentUser()?.nameDisplay); });
  protected memberAvatar = computed<AvatarInfo>(() => {
    const m = this.formData() ?? this.membership();
    return newAvatarInfo(m.memberKey, m.memberName1, m.memberName2, m.memberModelType, '', '', this.name());
  });
  protected orgAvatar = computed<AvatarInfo>(() => {
    const m = this.formData() ?? this.membership();
    return newAvatarInfo(m.orgKey, '', m.orgName, m.orgModelType, '', '', m.orgName);
  });
  protected memberKey = computed(() => this.formData()?.memberKey ?? '');
  protected currentMcat = computed<CategoryListModel>(() => {
    const orgKey = (this.formData() ?? this.membership()).orgKey;
    const org = this.appStore.allOrgs().find(o => o.bkey === orgKey);
    return this.appStore.tryGetCategory(org?.membershipCategoryKey ?? 'mcat_default') ?? this.mcat();
  });

  /******************************* actions *************************************** */
  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.manualDirty.set(false);
    this.formData.set(safeStructuredClone(this.membership()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: MembershipModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}

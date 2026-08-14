import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, CategoryListModel, GroupModelName, MembershipModel, MembershipModelName, PrivacySettings, RoleName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, getFullName, hasRole, newAvatarInfo, safeStructuredClone } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';

import { CommentsAccordion } from '@okr/comment-feature';
import { DocumentsAccordion } from '@okr/content-document-feature';

import { MembershipForm } from '@okr/relationship-membership-ui';
import { RelationshipToolbar } from '@okr/avatar-ui';
import { MEMBERSHIP_I18N_KEYS, MembershipI18n } from '@okr/relationship-membership-util';

@Component({
  selector: 'okr-membership-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordion, MembershipForm, RelationshipToolbar, Header,
    ChangeConfirmation, DocumentsAccordion,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" [saveDisabled]="saveDisabled()" [showCancel]="false" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">

      @if(currentUser(); as currentUser) {
        <okr-relationship-toolbar
          relType="membership"
          [subjectAvatar]="memberAvatar()"
          [objectAvatar]="orgAvatar()"
          [relDesc1]="i18n.reldesc1()" [relDesc2]="i18n.reldesc2()"
          [currentUser]="currentUser"
        />
          @if(!isGroupMembership() && formData(); as formData) {
            <okr-membership-form
              [formData]="formData"
              (formDataChange)="onFormDataChange($event)"
              [currentUser]="currentUser"
              [membershipCategories]="currentMcat()"
              [allTags]="tags()"
              [readOnly]="isReadOnly()"
              [priv]="priv()"
              [i18n]="i18n"
              (dirty)="manualDirty.set($event)"
              (valid)="formValid.set($event)"
            />
          }
      }

      @if(hasRole('privileged') && !isReadOnly() && !isNew()) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <okr-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class MembershipEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(MEMBERSHIP_I18N_KEYS) as MembershipI18n;
  protected readonly appStore = inject(AppStore);

  // inputs
  public membership = input.required<MembershipModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public priv = input.required<PrivacySettings>();
  public mcat = input<CategoryListModel | undefined>(); // undefined for groups / tenants without a shared mcat
  public isNew = input.required<boolean>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.membership()));
  protected manualDirty = signal(false);

  // derived signals
  protected headerTitle = computed(() => this.isReadOnly() ? this.i18n.view_label() : this.i18n.update_label());
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
  // May legitimately be undefined: a group has no membership category, and a tenant may
  // not use the shared 'mcat' definition at all (scs has mcat_scs/mcat_srv). The form
  // renders without the category picker in that case — it must NOT stay hidden.
  protected currentMcat = computed<CategoryListModel | undefined>(() => {
    const orgKey = (this.formData() ?? this.membership()).orgKey;
    const org = this.appStore.allOrgs().find(o => o.okey === orgKey);
    return this.appStore.tryGetCategory(org?.membershipCategoryKey ?? 'mcat') ?? this.mcat();
  });
  // a group membership carries nothing the user could edit here — the member and the group
  // are both fixed, so the modal is a plain confirmation and the form stays hidden
  protected isGroupMembership = computed(() => (this.formData() ?? this.membership()).orgModelType === GroupModelName);
  // toolbar is shown from the start in edit mode; the save button itself is gated on validity
  protected showConfirmation = computed(() => !this.isReadOnly());
  protected saveDisabled = computed(() => !this.isGroupMembership() && !this.formValid());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.formData(), 'confirm');
  }

  protected onFormDataChange(formData: MembershipModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}

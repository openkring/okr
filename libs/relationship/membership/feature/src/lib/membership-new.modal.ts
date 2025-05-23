import { Component, computed, inject, input, linkedSignal, OnInit, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { ModelType, OrgModel, PersonModel, UserModel} from '@bk2/shared/models';
import { convertMemberAndOrgToNewForm } from '@bk2/membership/util';
import { MembershipNewStore } from './membership-new.store';
import { MembershipNewFormComponent } from './membership-new.form';

@Component({
  selector: 'bk-membership-new-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    MembershipNewFormComponent, HeaderComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  providers: [MembershipNewStore],
  template: `
    <bk-header title="{{ '@membership.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      @if(mcat(); as mcat) {
        <bk-membership-new-form [(vm)]="vm" [membershipCategories]="mcat" [currentUser]="currentUser()" (validChange)="onValidChange($event)" />
      }
    </ion-content>
  `
})
export class MembershipNewModalComponent implements OnInit {
  private readonly modalController = inject(ModalController);
  protected readonly membershipNewStore = inject(MembershipNewStore);

  public member = input.required<PersonModel | OrgModel>();
  public org = input.required<OrgModel>(); 
  public currentUser = input<UserModel | undefined>();
  public modelType = input.required<ModelType>();

  public vm = linkedSignal(() => convertMemberAndOrgToNewForm(this.member(), this.org(), this.membershipNewStore.currentUser(), this.modelType()));

  protected mcat = computed(() => this.membershipNewStore.membershipCategory());

  protected formIsValid = signal(false);

  ngOnInit() {
    // as we prepared everything with defaultMember and defaultOrg, we already have a valid form, so we need to signal this here.
    this.onValidChange(true);
  }

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.membershipNewStore.currentUser());
  }

  protected onValidChange(valid: boolean): void {
    this.formIsValid.set(valid);
    const _orgId = this.vm().orgKey;
    if (_orgId && _orgId !== this.membershipNewStore.orgId()) {
      this.membershipNewStore.setOrgId(_orgId);
    }
  }
}

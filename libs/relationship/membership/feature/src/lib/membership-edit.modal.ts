import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared/ui';
import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { MembershipFormComponent } from '@bk2/membership/ui';
import { ENV, RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { MembershipCollection, MembershipModel, ModelType, UserModel } from '@bk2/shared/models';
import { convertFormToMembership, convertMembershipToForm, getMembershipName } from '@bk2/membership/util';
import { MembershipEditStore } from './membership-edit.store';

@Component({
  selector: 'bk-membership-edit-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, MembershipFormComponent, RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent,
    IonContent, IonAccordionGroup
  ],
  providers: [MembershipEditStore],
  template: `
    <bk-header title="{{ modalTitle() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-relationship-toolbar [titleArguments]="titleArguments()" />
      @if(mcat(); as mcat) {
        <bk-membership-form [(vm)]="vm" [membershipCategories]="mcat" [membershipTags]="membershipTags()" [currentUser]="currentUser()" (validChange)="formIsValid.set($event)" />
      }
      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="collectionName" [parentKey]="memberKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class MembershipEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly membershipEditStore = inject(MembershipEditStore);
  private readonly env = inject(ENV);

  public membership = input.required<MembershipModel>();
  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => convertMembershipToForm(this.membership()));

  protected modalTitle = computed(() => this.getModalTitle());
  protected readonly name = computed(() => getMembershipName(this.membership()));
  protected membershipTags = computed(() => this.membershipEditStore.getTags());
    protected titleArguments = computed(() => ({
      relationship: 'membership',
      subjectName: this.name(),
      subjectIcon: this.membership().memberModelType === ModelType.Person ? 'person' : 'org',
      subjectUrl: this.membership().memberModelType === ModelType.Person ? `/person/${this.membership().memberKey}` : `/org/${this.membership().memberKey}`,
      objectName: this.membership().orgName,
      objectIcon: 'org',
      objectUrl: `/org/${this.membership().orgKey}`
    }));
  
  protected memberKey = computed(() => this.vm().memberKey ?? '');
  protected mcat = computed(() => this.membershipEditStore.membershipCategory());

  protected formIsValid = signal(false);
  public collectionName = MembershipCollection;

  constructor() {
    effect(() => {
      this.membershipEditStore.setMembership(this.membership());
    });
  }

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToMembership(this.membership(), this.vm(), this.env.owner.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  private getModalTitle(): string {
    const _operation = hasRole('memberAdmin', this.currentUser()) ? 'update' : 'view';
    return `@membership.operation.${_operation}.label`;
  }
}

import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipCollection, MembershipModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';

import { MembershipFormComponent } from '@bk2/relationship-membership-ui';
import { convertFormToMembership, convertMembershipToForm, getMembershipName } from '@bk2/relationship-membership-util';
import { MembershipEditStore } from './membership-edit.store';

@Component({
  selector: 'bk-membership-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, MembershipFormComponent, RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [MembershipEditStore],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
    <bk-header title="{{ modalTitle() | translate | async }}" [isModal]="true" />
    @if(formIsValid() && !isReadOnly()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-relationship-toolbar [titleArguments]="titleArguments()" />
      @if(mcat(); as mcat) {
        <bk-membership-form [(vm)]="vm"
          [membershipCategories]="mcat"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          [priv]="priv()"
          [currentUser]="currentUser()"
          (validChange)="formIsValid.set($event)" />
      }

      @if(hasRole('privileged') || !isReadOnly()) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-comments-accordion [collectionName]="collectionName" [parentKey]="memberKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
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
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  public vm = linkedSignal(() => convertMembershipToForm(this.membership()));
  protected priv = computed(() => this.membershipEditStore.privacySettings());
  
  protected modalTitle = computed(() => this.isReadOnly() ? '@membership.operation.view.label' : '@membership.operation.update.label');

  protected readonly name = computed(() => getMembershipName(this.membership()));
  protected tags = computed(() => this.membershipEditStore.getTags());
    protected titleArguments = computed(() => ({
      relationship: 'membership',
      subjectName: this.name(),
      subjectIcon: this.membership().memberModelType === 'person' ? 'person' : 'org',
      subjectUrl: this.membership().memberModelType === 'person' ? `/person/${this.membership().memberKey}` : `/org/${this.membership().memberKey}`,
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
    return this.modalController.dismiss(convertFormToMembership(this.membership(), this.vm(), this.env.tenantId), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formIsValid.set(false);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}

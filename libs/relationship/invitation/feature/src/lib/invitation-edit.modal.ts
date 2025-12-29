import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, InvitationModel, InvitationModelName, RoleName, TransferModel, TransferModelName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ModelSelectService } from '@bk2/shared-feature';

import { InvitationFormComponent } from '@bk2/relationship-invitation-ui';


@Component({
  selector: 'bk-invitation-edit-modal',
  standalone: true,
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  imports: [
    HeaderComponent, ChangeConfirmationComponent, InvitationFormComponent, CommentsAccordionComponent, 
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-invitation-form
        [formData]="formData()"
        (formDataChange)="onFormDataChange($event)"
        [currentUser]="currentUser()"
        [allTags]="tags()"
        [states]="states()"
        [readOnly]="readOnly()"
        [showForm]="showForm()"
        (dirty)="formDirty.set($event)"
        (valid)="formValid.set($event)"
        (selectClicked)="select($event)"
      />

      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-comments-accordion [parentKey]="parentKey()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class InvitationEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly modelSelectService = inject(ModelSelectService);

  // inputs
  public invitation = input.required<InvitationModel>();
  public currentUser = input.required<UserModel>();
  public types = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public tags = input.required<string>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => structuredClone(this.invitation()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('invitation', this.invitation()?.bkey, this.readOnly()));
  protected readonly parentKey = computed(() => `${InvitationModelName}.${this.invitationKey()}`);
  protected readonly invitationKey = computed(() => this.invitation().bkey ?? '');  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm')
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.invitation()));  // reset the form
      // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: InvitationModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async select(object: string): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar();
    if (avatar) {
      const invitation = this.formData();
      if (object === 'inviter') {
        invitation.inviterKey = avatar.key;
        invitation.inviterFirstName = avatar.name1;
        invitation.inviterLastName = avatar.name2;
      }
      else { // invitee
        invitation.inviteeKey = avatar.key;
        invitation.inviteeFirstName = avatar.name1;
        invitation.inviteeLastName = avatar.name2;
      }
      this.formData.set(invitation);
    }
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, CategoryListModel, PersonModel, ReservationModel, ReservationModelName, ResourceModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, isPerson, isResource, newAvatarInfo } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ReservationFormComponent } from '@bk2/relationship-reservation-ui';
import { getReserverName } from '@bk2/relationship-reservation-util';
import { PersonSelectModalComponent, ResourceSelectModalComponent } from '@bk2/shared-feature';
import { ENV } from '@bk2/shared-config';

@Component({
  selector: 'bk-reservation-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordionComponent, RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent, ReservationFormComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        <bk-relationship-toolbar
          relType="reservation"
          title="@reservation.reldesc"
          [subjectAvatar]="reserverAvatar()"
          [objectAvatar]="resourceAvatar()"
          [currentUser]="currentUser"
          icon="reservation"
          relLabel="Reservation"
        />
        <bk-reservation-form
          [formData]="formData()"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser"
          [allTags]="tags()"
          [reasons]="reasons()"
          [states]="states()"
          [readOnly]="isReadOnly()"
          [isSelectable]="isSelectable()"
          [periodicities]="periodicities()"
          (selectReserver)="selectReserver()"
          (selectResource)="selectResource()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

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
  `
})
export class ReservationEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly env = inject(ENV);

  // inputs
  public reservation = input.required<ReservationModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public reasons = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public isSelectable = input<boolean>(false);
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => structuredClone(this.reservation()));
  protected showForm = signal(true);

  protected readonly parentKey = computed(() => `${ReservationModelName}.${this.reservationKey()}`);
  
  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('reservation', this.reservation()?.bkey, this.readOnly()));
  protected readonly reservationKey = computed(() => this.reservation().bkey ?? '');
  protected readonly name = computed(() => getReserverName(this.reservation()) ?? '');
  protected reserverAvatar = computed<AvatarInfo>(() => {
    const r = this.reservation();
      return newAvatarInfo(r.reserverKey, r.reserverName, r.reserverName2, r.reserverModelType, r.reserverType, '', r.name);
  });
  protected resourceAvatar = computed<AvatarInfo>(() => {
    const r = this.reservation();
      return newAvatarInfo(r.resourceKey, '', r.resourceName, r.resourceModelType, r.resourceType, r.resourceSubType, r.resourceName);
  });

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.reservation()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: ReservationModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectReserver(): Promise<void> {
    const person = await this.selectPersonModal();
    if (!person) return;

    this.formData.update((vm) => ({
      ...vm,
      reserverKey: person.bkey,
      reserverName: person.firstName,
      reserverName2: person.lastName,
      reserverModelType: 'person',
      reserverType: person.gender,
    }));
  }

  async selectPersonModal(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isPerson(data, this.env.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  protected async selectResource(): Promise<void> {
    const resource = await this.selectResourceModal();
    if (!resource) return;
    this.formData.update((vm) => ({
      ...vm,
      resourceKey: resource.bkey,
      resourceName: resource.name,
      resourceModelType: 'resource',
      resourceType: resource.type,
      resourceSubType: resource.subType,
    }));
  }

    async selectResourceModal(): Promise<ResourceModel | undefined> {
    const modal = await this.modalController.create({
      component: ResourceSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isResource(data, this.env.tenantId)) {
        return data;
      }
    }
    return undefined;
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonRow, ModalController, IonButton } from '@ionic/angular/standalone';

import { AvatarInfo, CalEventModel, CategoryListModel, PersonModel, ReservationModel, ReservationModelName, ResourceModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, getAvatarName, hasRole, isPerson, isResource } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CalEventEditModalComponent } from '@bk2/calevent-feature';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ReservationFormComponent } from '@bk2/relationship-reservation-ui';
import { AppStore, PersonSelectModalComponent, ResourceSelectModalComponent } from '@bk2/shared-feature';
import { ENV } from '@bk2/shared-config';
import { isCalEvent } from '@bk2/calevent-util';

@Component({
  selector: 'bk-reservation-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordionComponent, RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent, ReservationFormComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent,
    IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol,
    IonButton
],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        @if(reserverAvatar(); as reserver) {
          @if(resourceAvatar(); as resource) {
            <bk-relationship-toolbar
              relType="reservation"
              title="@reservation.reldesc"
              [subjectAvatar]="resource"
              [objectAvatar]="reserver"
              [currentUser]="currentUser"
              icon="reservation"
              relLabel="Reservation"
            />
          }
        }
     <ion-card>
        <ion-card-header>
          <ion-card-title>Zeitliche Angaben</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-button expand="block" (click)="selectCalevent()">Ändern</ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                tbd
                <!-- <bk-date-input name="startDate" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [showHelper]=true [readOnly]="isReadOnly()" /> -->
              </ion-col>
              <!--
              <ion-col size="12" size-md="6"> 
                <bk-text-input name="startTime" [value]="startTime()" (valueChange)="onFieldChange('startTime', $event)" [maxLength]=5 [mask]="timeMask" [readOnly]="isReadOnly()" />                                        
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="endDate" [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6"> 
                <bk-text-input name="endTime" [value]="endTime()" (valueChange)="onFieldChange('endTime', $event)" [maxLength]=5 [mask]="timeMask" [readOnly]="isReadOnly()" />                                        
              </ion-col>
    -->
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

        <bk-reservation-form
          [formData]="formData()"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser"
          [allTags]="tags()"
          [tenantId]="tenantId()"
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
  private readonly appstore = inject(AppStore);

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
  protected calevent = signal<CalEventModel | undefined>(undefined);

  protected readonly parentKey = computed(() => `${ReservationModelName}.${this.reservationKey()}`);
  
  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('reservation', this.reservation()?.bkey, this.readOnly()));
  protected readonly reservationKey = computed(() => this.reservation().bkey ?? '');
  protected reserverAvatar = computed<AvatarInfo | undefined>(() => this.reservation().reserver);
  protected readonly reserverName = computed(() => this.reserverAvatar() ? getAvatarName(this.reserverAvatar(), this.currentUser()?.nameDisplay) : '');
  protected readonly resourceAvatar = computed<AvatarInfo | undefined>(() => this.reservation().resource);
  protected readonly tenantId = computed(() => this.appstore.tenantId());

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
      if (isPerson(data, this.tenantId())) {
        return data;
      }
    }
    return undefined;
  }

  async selectCalevent(): Promise<void> {
    const modal = await this.modalController.create({
      component: CalEventEditModalComponent,
      cssClass: 'wide-modal',
      componentProps: {
            calevent: this.calevent() ?? new CalEventModel(this.tenantId()),
            currentUser: this.currentUser(),
            types: this.appstore.getCategory('calevent_type'),
            periodicities: this.periodicities(),
            tags: this.appstore.getTags('calevent'),
            tenantId: this.tenantId(),
            locale: this.appstore.appConfig().locale,
            readOnly: this.isReadOnly()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isCalEvent(data, this.tenantId())) {
        this.calevent.set(data);
        console.log('selected calevent:', data);
        this.formData.update((vm) => ({
          ...vm,
          caleventKey: data.bkey,
          startDate: data.startDate,
          endDate: data.endDate ?? data.startDate,
        }));
      }
    }
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
      if (isResource(data, this.tenantId())) {
        return data;
      }
    }
    return undefined;
  }
}

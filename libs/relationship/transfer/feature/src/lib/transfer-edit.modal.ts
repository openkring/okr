import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, RoleName, TransferModel, TransferModelName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole, safeStructuredClone } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { TransferFormComponent } from '@bk2/relationship-transfer-ui';
import { ModelSelectService } from '@bk2/shared-feature';


@Component({
  selector: 'bk-transfer-edit-modal',
  standalone: true,
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  imports: [
    HeaderComponent, ChangeConfirmationComponent, TransferFormComponent, CommentsAccordionComponent, 
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-transfer-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [types]="types()"
          [states]="states()"
          [periodicities]="periodicities()"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (selectSubject)="selectSubject()"
          (selectObject)="selectObject()"
          (selectResource)="selectResource()"
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
  `,
})
export class TransferEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly modelSelectService = inject(ModelSelectService);

  // inputs
  public transfer = input.required<TransferModel>();
  public currentUser = input.required<UserModel>();
  public types = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => safeStructuredClone(this.transfer()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('transfer', this.transfer()?.bkey, this.readOnly()));
  protected readonly parentKey = computed(() => `${TransferModelName}.${this.transferKey()}`);
  protected readonly transferKey = computed(() => this.transfer().bkey ?? '');  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm')
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.transfer()));  // reset the form
      // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: TransferModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectSubject(): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar();
    const formData = this.formData();
    if (avatar && formData) {
      const subjects = formData.subjects;
      subjects.push(avatar);
      this.formData.update((vm: TransferModel | undefined) => {
        if (!vm) return vm;
        return { ...vm, subjects };
      });
    }
    this.formDirty.set(true);
  }

  protected async selectObject(): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar();
    const formData = this.formData();
    if (avatar && formData) {
      const objects = formData.objects;
      objects.push(avatar);
      this.formData.update((vm: TransferModel | undefined) => {
        if (!vm) return vm;
        return { ...vm, objects };
      });
    }
    this.formDirty.set(true);
  }

  protected async selectResource(): Promise<void> {
    const resource = await this.modelSelectService.selectResourceAvatar();
    if (resource) {
      this.formData.update((vm: TransferModel | undefined) => {
        if (!vm) return vm;
        return { ...vm, resource };
      });
    }
    this.formDirty.set(true);
  }
}

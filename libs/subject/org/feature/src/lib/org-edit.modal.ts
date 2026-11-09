import { ChangeDetectorRef, Component, ComponentRef, computed, DestroyRef, effect, inject, input, linkedSignal, signal, untracked, viewChild, ViewContainerRef } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular';

import { CategoryListModel, OrgModel, OrgModelName, ResourceModel, RoleName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, hasRole, safeStructuredClone } from '@okr/shared-util-core';
import { DEFAULT_TITLE } from '@okr/shared-constants';
import { ENV } from '@okr/shared-config';

import { AvatarToolbar } from '@okr/avatar-feature';
import { AvatarService } from '@okr/avatar-data-access';
import { CommentsAccordion } from '@okr/comment-feature';
import { getDocumentStoragePath } from '@okr/content-document-util';
import { DocumentsAccordion } from '@okr/content-document-feature';

import { BillAccordion } from '@okr/finance-bill-feature';
import { InvoiceAccordion } from '@okr/finance-invoice-feature';

import { MembersAccordion, MembershipAccordion } from '@okr/relationship-membership-feature';
import { OwnershipAccordion } from '@okr/relationship-ownership-feature';
import { ReservationsAccordion } from '@okr/relationship-reservation-feature';
import { WorkrelAccordion } from '@okr/relationship-workrel-feature';
import { FeatureStore } from '@okr/tenant-feature';
import { NewsChannelService } from '@okr/social-news-center-data-access';

import { AddressesAccordion } from '@okr/subject-address-feature';
import { OrgForm } from '@okr/subject-org-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { OrgStore } from './org.store';
import { AppStore } from '@okr/shared-feature';

@Component({
  selector: 'okr-org-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    AvatarToolbar, AddressesAccordion, CommentsAccordion,
    OwnershipAccordion, OrgForm, MembershipAccordion, MembersAccordion,
    ReservationsAccordion, DocumentsAccordion, BillAccordion, InvoiceAccordion, WorkrelAccordion,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [OrgStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} } `],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(!isNew()) {
        <okr-avatar-toolbar key="{{parentKey()}}" [title]="toolbarTitle()" modelType="org" [readOnly]="isReadOnly()" (imageSelected)="onImageSelected($event)"/>
      }
      @if(formData(); as formData) {
        <okr-org-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="store.i18n"
          [currentUser]="currentUser()"
          [types]="types()"
          [showForm]="showForm()"
          [allTags]="allTags()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
      @if(!isNew()) {
        @if(org(); as org) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-accordion-group value="addresses" [multiple]="true">
                <okr-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" [priv]="priv()" />
                <okr-membership-accordion [member]="org" [readOnly]="isReadOnly()" modelType="org" />
                <okr-workrel-accordion [orgKey]="orgKey()" [readOnly]="isReadOnly()" />
                <!-- the org's webcams (NewsCenter, design 2026-11-09 §5.4), mounted lazily by mountWebcams -->
                <ng-container #webcamHost />

                @if(hasRole('privileged') || hasRole('memberAdmin') || hasRole('resourceAdmin')) {
                    @if(resource(); as resource) {
                      <okr-ownerships-accordion [owner]="org" [defaultResource]="resource" ownerModelType="org" [readOnly]="isReadOnly()" />
                      <okr-reservations-accordion [listId]="listId()" [readOnly]="isReadOnly()" />
                    }
                    <okr-members-accordion [orgKey]="orgKey()" [orgType]="orgType()" [readOnly]="isReadOnly()" />
                    <okr-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()"/>
                    <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
                }
                @if(showFinance()) {
                  <okr-invoice-accordion [listId]="orgKey()" />
                  <okr-bill-accordion [listId]="orgKey()" />
                }
              </ion-accordion-group>
            </ion-card-content>
          </ion-card>
        }
      }
    </ion-content>
  `
})
export class OrgEditModal {
  protected readonly store = inject(OrgStore);
  private readonly modalController = inject(ModalController);
  private readonly avatarService = inject(AvatarService);
  private readonly env = inject(ENV);
  private readonly featureStore = inject(FeatureStore);
  private readonly newsChannelService = inject(NewsChannelService);
  private readonly cdr = inject(ChangeDetectorRef);

  // inputs
  public org = input.required<OrgModel>();
  public currentUser = input<UserModel | undefined>();
  public resource = input<ResourceModel | undefined>();
  public tags = input<string>('');
  /** When set, the tag vocabulary is read live, so a value added via «Werte bearbeiten» validates at once. */
  public tagModel = input<string>('');
  private readonly appStore = inject(AppStore);
  protected readonly allTags = computed(() => this.tagModel() ? this.appStore.getTags(this.tagModel()) : this.tags());
  public tenantId = input.required<string>();
  public types = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.org()));
  protected showForm = signal(true);

  // derived 
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.org()?.okey));
  protected toolbarTitle = computed(() => this.org()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${OrgModelName}.${this.orgKey()}`);
  protected path = computed(() => getDocumentStoragePath(this.env.tenantId, 'org', this.org()?.okey));
  protected orgKey = computed(() => this.org()?.okey ?? '');
  protected orgType = computed((): 'org' | 'group' => this.org()?.type === 'group' ? 'group' : 'org');
  protected isNew = computed(() => !this.org()?.okey.length);
  protected listId = computed(() => 'o_' + this.orgKey());
  protected priv = computed(() => this.store.privacySettings());
  // the bills and invoices rules let only treasurers and admins read other parties' documents;
  // for anybody else the query is denied and the accordion would stay silently empty
  protected showFinance = computed(() => this.featureStore.isEnabled()('finance')
    && (this.hasRole('treasurer') || this.hasRole('admin')));
  // webcams hosted by this org: only with NewsCenter on and at least one camera; the panel's code
  // (@okr/social-news-center-feature) is imported only then, never statically by this lib
  private readonly orgWebcams = toSignal(
    toObservable(this.orgKey).pipe(switchMap((key) => (key ? this.newsChannelService.listByOrg(this.tenantId(), key) : of([])))),
    { initialValue: [] },
  );
  protected readonly showWebcams = computed(() => this.featureStore.isEnabled()('news-center') && this.orgWebcams().length > 0);
  private readonly webcamHost = viewChild('webcamHost', { read: ViewContainerRef });
  private webcamRef: ComponentRef<unknown> | undefined;
  private webcamHostRef: ViewContainerRef | undefined;

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());

  constructor() {
    effect(() => {
      const host = this.webcamHost();
      const show = this.showWebcams();
      const orgKey = this.orgKey();
      untracked(() => void this.syncWebcamPanel(host, show, orgKey));
    });
    inject(DestroyRef).onDestroy(() => this.webcamRef?.destroy());
  }

  /** Creates, re-keys or drops the lazily loaded webcam panel (memory: lazy host in @if, createComponent CD pass). */
  private async syncWebcamPanel(host: ViewContainerRef | undefined, show: boolean, orgKey: string): Promise<void> {
    if (host !== this.webcamHostRef) {   // the host left or was re-rendered: its old ref is dead
      this.webcamRef?.destroy();
      this.webcamRef = undefined;
      this.webcamHostRef = host;
    }
    if (!host || !show) {
      this.webcamRef?.destroy();
      this.webcamRef = undefined;
      return;
    }
    if (this.webcamRef) {
      this.webcamRef.setInput('orgKey', orgKey);
      return;
    }
    const { NewsWebcamPanel } = await import('@okr/social-news-center-feature');
    if (host !== this.webcamHostRef || this.webcamRef || !this.showWebcams()) return;   // changed while loading
    this.webcamRef = host.createComponent(NewsWebcamPanel);
    this.webcamRef.setInput('orgKey', orgKey);
    this.webcamRef.changeDetectorRef.detectChanges();
    this.cdr.markForCheck();
  }
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.org()));  // reset the form
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: OrgModel): void {
    this.formData.set(formData);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.avatarService.saveAvatarPhoto(photo, this.orgKey(), this.env.tenantId, OrgModelName);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected getTitleLabel(readOnly: boolean, key: string): string {
    if (this.readOnly()) {
      return this.store.i18n.view();
    }
    if (key.length > 0) {
      return this.store.i18n.update();
    } else {
      return this.store.i18n.create();
    }
  }
}

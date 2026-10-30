import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import { IonContent, ModalController } from '@ionic/angular';

import { CategoryListModel, LocationModel, SectionModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, ErrorBanner, Header} from '@okr/shared-ui';
import { coerceBoolean, deepEqual, hasRole, safeStructuredClone } from '@okr/shared-util-core';
import { SectionForm } from '@okr/cms-section-ui';
import { LocationService } from '@okr/location-data-access';
import { ContractService } from '@okr/business-contract-data-access';
import { dismissOverlay } from '@okr/shared-util-angular';

import { SectionStore } from './section.store';
import { AppStore } from '@okr/shared-feature';


/**
 * This modal is used to edit a SectionModel.
 * `dirty` is derived from a deep comparison of initial vs current form data, while validity
 * comes from the per-type vest suite run inside SectionForm (emitted via its `valid` output).
 * The save action is only offered when the form is both dirty and valid.
 */
@Component({
    selector: 'okr-section-edit-modal',
    standalone: true,
    imports: [
      ChangeConfirmation, Header, ErrorBanner, SectionForm,
      IonContent
    ],
    providers: [SectionStore],
    template: `
      <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
      @if(formDirty() && formValid() && formData()) {
        <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
      }
      <okr-error-banner [message]="store.errorMessage()" (dismiss)="store.clearError()" />
      <ion-content class="ion-no-padding">
        @if(formData(); as formData) {
          <okr-section-form
            [i18n]="store.i18n"
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser()"
            [showForm]="showForm()"
            [roles]="roles()"
            [states]="states()"
            [albumStyles]="albumStyles()"
            [weatherLocations]="weatherLocations()"
            [contracts]="contracts()"
            [allTags]="allTags()"
            [tenantId]="tenantId()"
            [linkOrigins]="store.appStore.appLinkOrigins()"
            [readOnly]="isReadOnly()"
            (valid)="formValid.set($event)"
          />
        }
      </ion-content>
  `
})
export class SectionEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(SectionStore);

  // inputs
  public section = input.required<SectionModel>();
  public currentUser = input.required<UserModel>();
  public tags = input<string>('');
  /** When set, the tag vocabulary is read live, so a value added via «Werte bearbeiten» validates at once. */
  public tagModel = input<string>('');
  private readonly appStore = inject(AppStore);
  protected readonly allTags = computed(() => this.tagModel() ? this.appStore.getTags(this.tagModel()) : this.tags());
  public roles = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected albumStyles = computed(() => this.store.appStore.getCategory('album_style'));

  /**
   * Locations offered by the weather configuration. Subscribed unconditionally rather than
   * only for weather sections: `FirestoreService` shares the query, so a second subscriber
   * costs nothing, and gating it on the section type would need the type before the form
   * exists.
   */
  private locations = toSignal(inject(LocationService).list(), { initialValue: [] as LocationModel[] });
  protected weatherLocations = computed(() =>
    this.locations().map((l) => ({ okey: l.okey, name: l.name })));

  /**
   * Contracts a ContractDocument button may point at (spec 1.97). Only contract staff may list
   * them (rules), so anyone else gets [] and types the key; strictly confidential contracts are
   * left out because they can never share a file.
   */
  private readonly canListContracts = computed(() =>
    this.section().type === 'button' && (hasRole('admin', this.currentUser()) || hasRole('treasurer', this.currentUser())));
  private readonly contractService = inject(ContractService);
  protected contracts = toSignal(toObservable(this.canListContracts).pipe(
    switchMap((ok) => (ok ? this.contractService.listStaff(false) : of([]))),
    map((list) => list.map((c) => ({ okey: c.okey, name: c.name || c.okey }))),
  ), { initialValue: [] as { okey: string; name: string }[] });

  // signals
  protected initialData = signal<SectionModel | undefined>(undefined);
  protected formDirty = linkedSignal(() => {
    const fd = this.formData();
    return fd ? !fd.okey || fd.okey.length === 0 : false;
  });
  protected formData = linkedSignal(() => safeStructuredClone(this.section()));
  protected formValid = signal(true);
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.section().okey));
  protected tenantId = computed(() => this.store.tenantId());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  constructor() {
    effect(() => {
      const orig = this.section();
      this.initialData.set(safeStructuredClone(orig));
    });
    effect(() => {
      const current = this.formData();
      const initial = this.initialData();
      if (initial && !deepEqual(current, initial)) {
        this.formDirty.set(true);
      } else {
        this.formDirty.set(false);
      }
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formData.set(safeStructuredClone(this.section()));  // reset the form
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update(vm => vm ? { ...vm, [fieldName]: fieldValue } : vm);
  }

  protected onFormDataChange(formData: SectionModel): void {
    this.formData.set(formData);
  }
}

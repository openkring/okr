import { Component, computed, effect, inject, Injector, input, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, from, map, of, switchMap } from 'rxjs';
import { IonContent, ModalController } from '@ionic/angular';

import { CategoryListModel, LocationModel, SectionModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, ErrorBanner, Header} from '@okr/shared-ui';
import { coerceBoolean, deepEqual, hasRole, safeStructuredClone } from '@okr/shared-util-core';
import { ChoiceFieldOption, CourseOption, FormOption, ResponsibilityOption, SectionForm } from '@okr/cms-section-ui';
import { LocationService } from '@okr/location-data-access';
import { ContractService } from '@okr/business-contract-data-access';
import { dismissOverlay, lazyService } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import { FormDefinitionService } from '@okr/forms-data-access';
import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';
import { FORM_I18N_KEYS, FormI18n } from '@okr/forms-util';

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
            [energyLocations]="energyLocations()"
            [contracts]="contracts()"
            [forms]="forms()"
            [courses]="courses()"
            [responsibilities]="responsibilities()"
            (openFormClicked)="openFormBuilder($event)"
            [formI18n]="formI18n"
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
  /** Municipalities offered by the energy configuration: `city` locations only (spec 2026-11-04 §6.2). */
  protected energyLocations = computed(() =>
    this.locations().filter((l) => l.type === 'city').map((l) => ({ okey: l.okey, name: l.name })));

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

  /**
   * What a form section offers (spec 1.125 B): the forms with their implicit fields, the courses for «Feste Werte»
   * and (below) the forms' texts for the acceptance card. Forms and courses are loaded for a form section only; every other type gets [].
   * The course data-access is imported lazily: it drags the finance booking service and has no business in this chunk's
   * static graph (same reasoning as the calevent store, spec 1.132).
   */
  private readonly isFormSection = computed(() => this.section().type === 'form');
  private readonly injector = inject(Injector);
  private readonly i18nService = inject(I18nService);
  private readonly formDefinitionService = inject(FormDefinitionService);
  private readonly courseService = lazyService(this.injector, () =>
    import('@okr/calendar-course-data-access').then(m => m.CourseService));
  protected forms = toSignal(toObservable(this.isFormSection).pipe(
    switchMap((ok) => (ok ? this.formDefinitionService.list().pipe(catchError(() => of([]))) : of([]))),
    map((list): FormOption[] => list
      .filter((def) => !def.isArchived && !!def.formKey)
      .map((def) => ({
        formKey: def.formKey,
        name: def.name || def.formKey,
        implicitFields: (def.fields ?? []).flatMap((field) => (field.type === 'implicit' ? [field] : [])),
        choiceFields: (def.fields ?? []).flatMap((field): ChoiceFieldOption[] => {
          if (field.type === 'dropdown' || field.type === 'radio') {
            const options = field.options ?? [];
            return [{ key: field.key, label: field.label, values: options.map((o) => o.value), labels: options.map((o) => o.label || o.value) }];
          }
          if (field.type === 'category') {
            const items = this.appStore.getCategory(field.categoryName)?.items ?? [];
            return [{ key: field.key, label: field.label, values: items.map((i) => i.name), labels: items.map((i) => i.name) }];
          }
          return [];
        }),
        showRemaining: def.showRemaining === true,
      }))),
  ), { initialValue: [] as FormOption[] });
  protected courses = toSignal(toObservable(this.isFormSection).pipe(
    switchMap((ok) => (ok ? from(this.courseService()).pipe(switchMap((service) => service.listAll()), catchError(() => of([]))) : of([]))),
    map((list): CourseOption[] => list
      .filter((course) => !course.isArchived)
      .map((course) => ({ okey: course.okey, name: course.name || course.okey }))
      .sort((a, b) => a.name.localeCompare(b.name))),
  ), { initialValue: [] as CourseOption[] });
  /** form section: the responsibilities, so the chosen one shows by name rather than by its key */
  private readonly responsibilityService = inject(ResponsibilityService);
  protected responsibilities = toSignal(toObservable(this.isFormSection).pipe(
    switchMap((ok) => (ok ? this.responsibilityService.list('name').pipe(catchError(() => of([]))) : of([]))),
    map((list): ResponsibilityOption[] => list.map((r) => ({ okey: r.okey, name: r.name || r.okey }))),
  ), { initialValue: [] as ResponsibilityOption[] });

  /**
   * Opens the form builder on top of this modal. The builder lives in forms-feature and is loaded on
   * demand: its editor (drag and drop, previews) has no business in the section editor's chunk.
   */
  protected async openFormBuilder(formKey: string): Promise<void> {
    const [form] = await firstValueFrom(this.formDefinitionService.list().pipe(
      map((list) => list.filter((def) => def.formKey === formKey && !def.isArchived)),
      catchError(() => of([])),
    ));
    if (!form) return;
    const { FormBuilderEditor } = await import('@okr/forms-feature');
    const modal = await this.modalController.create({ component: FormBuilderEditor, cssClass: 'wide-modal', componentProps: { form } });
    await modal.present();
  }

  /** the forms' texts for the acceptance card; a field initializer, because translateAll calls toSignal (no reactive context) */
  protected readonly formI18n = this.i18nService.translateAll(FORM_I18N_KEYS) as FormI18n;

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

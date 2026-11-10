import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';
import { combineLatest, of, switchMap } from 'rxjs';

import { NAME_LENGTH } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';
import { ApplicationKind, AvatarInfo, CategoryListModel, CourseModel, JsReportSettings, ReportProfile } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, DateInput, DateInputI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, defaultIsAnnounced, getItemLabel } from '@okr/shared-util-core';

import { Avatars } from '@okr/avatar-ui';
import {
  COURSE_NUMBER_LENGTH, CourseI18n, courseValidations, DEFAULT_JS_TYPE_MAPPING, JS_ACTIVITY_TYPES, JS_USER_GROUPS, jsMainSportCategories
} from '@okr/calendar-course-util';

const AUDIENCE_KINDS: ApplicationKind[] = ['youth', 'adult', 'transfer'];
const REPORT_PROFILES: ReportProfile[] = ['none', 'generic', 'js'];

/**
 * The course itself (spec 1.132 §5.1, §7.1): name, period, who is responsible, who trains, and how attendance is
 * reported. The amounts are NOT here — they live in the protected finance document (`okr-course-finance-form`).
 *
 * The group is preset by the caller and shown read-only. `trainerKeys` / `responsibleKeys` are maintained by the
 * server and neither shown nor edited. Persons are picked through `MODEL_SELECTOR`, like every other ui form.
 */
@Component({
  selector: 'okr-course-form',
  standalone: true,
  imports: [
    TextInput, DateInput, StringSelect, ErrorNote, Avatars, Checkbox, NumberInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonNote
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().form_attributes() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="groupI18n()" [value]="groupName() || groupKey()" [clearInput]="false"
                    [showHelper]="true" [readOnly]="true" />
                  <okr-error-note [errors]="groupKeyErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)"
                    [locale]="locale()" [showHelper]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="startDateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="endDateI18n()" [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)"
                    [locale]="locale()" [showHelper]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="endDateErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <okr-avatars name="courseResponsible"
          [avatars]="responsiblePersons()" (avatarsChange)="onFieldChange('responsiblePersons', $event)"
          (selectClicked)="addPerson('responsiblePersons')"
          [readOnly]="isReadOnly()"
          [title]="i18n().form_responsible_title()"
          [description]="i18n().form_responsible_description()"
          [sectionStyle]="true" titleIcon="people"
          [addLabel]="i18n().form_person_add()" />
        <okr-error-note [errors]="responsibleErrors()" />

        <okr-avatars name="courseTrainers"
          [avatars]="trainers()" (avatarsChange)="onFieldChange('trainers', $event)"
          (selectClicked)="addPerson('trainers')"
          [readOnly]="isReadOnly()"
          [title]="i18n().form_trainers_title()"
          [description]="i18n().form_trainers_description()"
          [sectionStyle]="true" titleIcon="people"
          [addLabel]="i18n().form_person_add()" />

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().form_announce_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label class="ion-text-wrap">
                      <h3>{{ i18n().form_announce_audience() }}</h3>
                      <ion-note>{{ i18n().form_announce_audienceHelper() }}</ion-note>
                    </ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                @for (option of audienceOptions(); track option.kind) {
                  <ion-col size="12" size-md="4">
                    <okr-checkbox [i18n]="option.i18n" [checked]="option.checked" (checkedChange)="onAudienceChange(option.kind, $event)"
                      [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="isAnnouncedI18n()" [checked]="isAnnounced()" (checkedChange)="onAnnouncedChange($event)"
                    [toggle]="true" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="isAnnouncedErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="placesI18n()" [value]="maxParticipants()" (valueChange)="onPlacesChange($event)"
                    [integer]="true" [min]="0" [clearInput]="false" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="placesErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().form_report_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-string-select [i18n]="profileI18n()" [stringList]="profiles" [labels]="profileLabels()"
                    [selectedString]="reportProfile()" (selectedStringChange)="onProfileChange($event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              @if (reportProfile() === 'js') {
                <ion-row>
                  <ion-col size="12" size-md="4">
                    <okr-text-input [i18n]="courseNumberI18n()" [value]="courseNumber()" (valueChange)="onSettingChange('courseNumber', $event)"
                      [maxLength]="courseNumberLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="courseNumberErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="4">
                    <okr-string-select [i18n]="userGroupI18n()" [stringList]="userGroups"
                      [selectedString]="userGroup()" (selectedStringChange)="onUserGroupChange($event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="userGroupErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="4">
                    <okr-string-select [i18n]="categoryI18n()" [stringList]="categoryOptions()" [labels]="categoryLabels()"
                      [selectedString]="mainSportCategory()" (selectedStringChange)="onSettingChange('mainSportCategory', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="categoryErrors()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-label class="ion-text-wrap">
                        <h3>{{ i18n().form_typeMapping_title() }}</h3>
                        <ion-note>{{ i18n().form_typeMapping_description() }}</ion-note>
                      </ion-label>
                    </ion-item>
                  </ion-col>
                  @for (row of mappingRows(); track row.name) {
                    <ion-col size="12" size-md="6">
                      <okr-string-select [i18n]="{ name: 'typeMapping-' + row.name, label: row.label }"
                        [stringList]="mappingOptions()" [labels]="mappingLabels()"
                        [selectedString]="row.value" (selectedStringChange)="onTypeMappingChange(row.name, $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                  }
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class CourseForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly nameLength = NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly courseNumberLength = COURSE_NUMBER_LENGTH;
  protected readonly profiles: string[] = REPORT_PROFILES;
  protected readonly userGroups: string[] = [...JS_USER_GROUPS];

  /**
   * Has the author touched the «angekündigt» switch? Until then a NEW course follows `defaultIsAnnounced(audience)`.
   * An existing course (it has an `okey`) shows its stored value and is never re-defaulted.
   */
  private readonly announceTouched = signal(false);

  private readonly modelSelector = inject(MODEL_SELECTOR);
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly formData = model.required<CourseModel>();
  public readonly i18n = input.required<CourseI18n>();
  /** the `calevent_type` category: one mapping row per item (spec 1.132 §5.1 `typeMapping`) */
  public readonly calEventTypes = input<CategoryListModel | undefined>();
  /** name of the preset group (shown read-only); falls back to the key */
  public readonly groupName = input('');
  public readonly locale = input('de-ch');
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset the Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signal form + Vest. The error notes read the same run back off the form (never a second call).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly courseForm = form(this.formData, (path) => validateVestTree(path, courseValidations as any));
  private readonly validationResult = vestErrors(this.courseForm);
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly groupKeyErrors = computed(() => this.validationResult().getErrors('groupKey'));
  protected readonly startDateErrors = computed(() => this.validationResult().getErrors('startDate'));
  protected readonly endDateErrors = computed(() => this.validationResult().getErrors('endDate'));
  protected readonly responsibleErrors = computed(() => this.validationResult().getErrors('responsiblePersons'));
  protected readonly courseNumberErrors = computed(() => this.validationResult().getErrors('reportSettings.courseNumber'));
  protected readonly userGroupErrors = computed(() => this.validationResult().getErrors('reportSettings.userGroup'));
  protected readonly isAnnouncedErrors = computed(() => this.validationResult().getErrors('isAnnounced'));
  protected readonly placesErrors = computed(() => this.validationResult().getErrors('maxParticipants'));
  protected readonly categoryErrors = computed(() => this.validationResult().getErrors('reportSettings.mainSportCategory'));

  // fields (Firestore hands over raw documents: coalesce what came later)
  protected readonly name = computed(() => this.formData().name ?? '');
  protected readonly groupKey = computed(() => this.formData().groupKey ?? '');
  protected readonly startDate = computed(() => this.formData().startDate ?? '');
  protected readonly endDate = computed(() => this.formData().endDate ?? '');
  protected readonly responsiblePersons = computed(() => this.formData().responsiblePersons ?? []);
  protected readonly trainers = computed(() => this.formData().trainers ?? []);
  protected readonly reportProfile = computed(() => this.formData().reportProfile ?? 'generic');
  protected readonly audience = computed(() => this.formData().audience ?? []);
  protected readonly isAnnounced = computed(() => this.formData().isAnnounced ?? false);
  protected readonly maxParticipants = computed(() => this.formData().maxParticipants ?? 0);
  private readonly settings = computed(() => this.formData().reportSettings ?? {});
  protected readonly courseNumber = computed(() => this.settings().courseNumber ?? '');
  protected readonly userGroup = computed(() => this.settings().userGroup ?? '');
  protected readonly mainSportCategory = computed(() => this.settings().mainSportCategory ?? '');
  private readonly typeMapping = computed(() => this.formData().typeMapping ?? {});

  /** only the categories that form a defined pair with the chosen user group */
  protected readonly categoryOptions = computed<string[]>(() => jsMainSportCategories(this.userGroup()));
  protected readonly categoryLabels = computed(() =>
    this.categoryOptions().map(c => c === 'abs1' ? this.i18n().category_abs1() : this.i18n().category_abs2()));
  protected readonly profileLabels = computed(() => [this.i18n().profile_none(), this.i18n().profile_generic(), this.i18n().profile_js()]);

  /** '' = not reported, then the activity types of the AWK (their names are the import's own, not translated) */
  protected readonly mappingOptions = computed(() => ['', ...JS_ACTIVITY_TYPES]);
  protected readonly mappingLabels = computed(() => [this.i18n().form_typeMapping_none(), ...JS_ACTIVITY_TYPES]);

  // one row per calevent type, labelled with the translated item name
  private readonly typeItems = computed(() => {
    const category = this.calEventTypes();
    return (category?.items ?? []).map(item => ({ name: item.name, labelKey: getItemLabel(category as CategoryListModel, item.name) }));
  });
  private readonly typeLabels = toSignal(
    toObservable(this.typeItems).pipe(
      switchMap(items => items.length === 0 ? of([] as string[]) : combineLatest(items.map(i => this.i18nService.translate(i.labelKey))))),
    { initialValue: [] as string[] });
  protected readonly mappingRows = computed(() => this.typeItems().map((item, index) => ({
    name: item.name,
    label: this.typeLabels()[index] || item.name,
    value: this.typeMapping()[item.name] ?? '',
  })));

  protected readonly audienceOptions = computed(() => {
    const i18n = this.i18n();
    const labels: Record<ApplicationKind, string> = { youth: i18n.form_announce_youth(), adult: i18n.form_announce_adult(), transfer: i18n.form_announce_transfer() };
    return AUDIENCE_KINDS.map(kind => ({
      kind, checked: this.audience().includes(kind), i18n: { name: 'audience-' + kind, label: labels[kind], helper: '' } as CheckboxI18n,
    }));
  });
  protected readonly isAnnouncedI18n = computed(() => ({
    name: 'isAnnounced', label: this.i18n().form_announce_isAnnounced(), helper: this.i18n().form_announce_isAnnouncedHelper(),
  } as CheckboxI18n));
  protected readonly placesI18n = computed(() => ({
    name: 'maxParticipants', label: this.i18n().form_announce_places_label(), placeholder: this.i18n().form_announce_places_placeholder(),
    helper: this.i18n().form_announce_places_helper(),
  } as NumberInputI18n));
  protected readonly nameI18n = computed(() => ({
    name: 'name', label: this.i18n().form_name_label(), placeholder: this.i18n().form_name_placeholder(), helper: this.i18n().form_name_helper(),
  } as TextInputI18n));
  protected readonly groupI18n = computed(() => ({
    name: 'group', label: this.i18n().form_group_label(), placeholder: '', helper: this.i18n().form_group_helper(),
  } as TextInputI18n));
  protected readonly startDateI18n = computed(() => ({
    name: 'startDate', label: this.i18n().form_startDate_label(), placeholder: this.i18n().form_startDate_placeholder(),
  } as DateInputI18n));
  protected readonly endDateI18n = computed(() => ({
    name: 'endDate', label: this.i18n().form_endDate_label(), placeholder: this.i18n().form_endDate_placeholder(),
  } as DateInputI18n));
  protected readonly profileI18n = computed(() => ({
    name: 'reportProfile', label: this.i18n().form_profile_label(), helper: this.i18n().form_profile_helper(),
  } as StringSelectI18n));
  protected readonly courseNumberI18n = computed(() => ({
    name: 'courseNumber', label: this.i18n().form_courseNumber_label(), placeholder: this.i18n().form_courseNumber_placeholder(), helper: this.i18n().form_courseNumber_helper(),
  } as TextInputI18n));
  protected readonly userGroupI18n = computed(() => ({
    name: 'userGroup', label: this.i18n().form_userGroup_label(), helper: this.i18n().form_userGroup_helper(),
  } as StringSelectI18n));
  protected readonly categoryI18n = computed(() => ({
    name: 'mainSportCategory', label: this.i18n().form_category_label(), helper: this.i18n().form_category_helper(),
  } as StringSelectI18n));

  constructor() {
    effect(() => this.valid.emit(this.courseForm().valid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | AvatarInfo[] | Record<string, string>): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onAudienceChange(kind: ApplicationKind, checked: boolean): void {
    const current = this.audience();
    // keep the canonical order, whatever order the boxes were ticked in
    const audience = AUDIENCE_KINDS.filter(k => k === kind ? checked : current.includes(k));
    this.dirty.emit(true);
    this.formData.update(vm => {
      const next: CourseModel = { ...vm, audience };
      if (!vm.okey && !this.announceTouched()) next.isAnnounced = defaultIsAnnounced(audience);
      return next;
    });
  }

  protected onAnnouncedChange(isAnnounced: boolean): void {
    // the checkbox also emits when the model is re-set to the value it already has: only a real change is a touch
    if (isAnnounced === this.isAnnounced()) return;
    this.announceTouched.set(true);
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, isAnnounced }));
  }

  protected onPlacesChange(value: number | null): void {
    const places = value ?? 0;
    if (places === this.maxParticipants()) return;
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, maxParticipants: places }));
  }

  /** The J+S start of a course: an empty mapping is prefilled with the default («training» → Training). */
  protected onProfileChange(profile: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => {
      const next: CourseModel = { ...vm, reportProfile: profile as ReportProfile };
      if (profile === 'js' && Object.keys(vm.typeMapping ?? {}).length === 0) next.typeMapping = { ...DEFAULT_JS_TYPE_MAPPING };
      return next;
    });
  }

  protected onSettingChange(field: keyof JsReportSettings, value: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, reportSettings: { ...(vm.reportSettings ?? {}), [field]: value } }));
  }

  /** A new user group may leave the chosen category undefined: reset it, or take the only one that fits. */
  protected onUserGroupChange(userGroup: string): void {
    const categories = jsMainSportCategories(userGroup);
    const current = this.mainSportCategory();
    const category = categories.length === 1 ? categories[0] : categories.includes(current as JsReportSettings['mainSportCategory']) ? current : '';
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, reportSettings: { ...(vm.reportSettings ?? {}), userGroup: userGroup as JsReportSettings['userGroup'], mainSportCategory: category as JsReportSettings['mainSportCategory'] } }));
  }

  /** '' removes the entry: an unmapped type is not reported. */
  protected onTypeMappingChange(typeName: string, activity: string): void {
    const mapping = { ...this.typeMapping() };
    if (activity) mapping[typeName] = activity;
    else delete mapping[typeName];
    this.onFieldChange('typeMapping', mapping);
  }

  protected async addPerson(field: 'responsiblePersons' | 'trainers'): Promise<void> {
    const current = this.formData()[field] ?? [];
    const avatar = await this.modelSelector.selectPersonAvatar(undefined, undefined, false, false, { excludeKeys: current.map(a => a.key) });
    // a new array: the computed mirror of formData must not be mutated
    if (avatar) this.onFieldChange(field, [...current, avatar]);
  }
}

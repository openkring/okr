import { ChangeDetectionStrategy, Component, DestroyRef, Signal, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { ChangeConfirmation, Header } from '@okr/shared-ui';
import type { ChangeConfirmationI18n } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';
import { settingsDiff, settingsGroupKey } from '@okr/tenant-util';
import type { IntegrationOption, SettingsChoice, SettingsContext, SettingsGroupId, SettingsI18n, SettingsPageOption, TenantSettings } from '@okr/tenant-util';

import { SettingsAppForm } from './settings-app.form';
import { SettingsDefaultsForm } from './settings-defaults.form';
import { SettingsImagesForm } from './settings-images.form';
import { SettingsLanguageForm } from './settings-language.form';
import { SettingsMailForm } from './settings-mail.form';
import { SettingsOperatorForm } from './settings-operator.form';
import { SettingsPlatformForm } from './settings-platform.form';
import { SettingsPrivacyForm } from './settings-privacy.form';
import { SettingsStartForm } from './settings-start.form';

/** The groups this modal has a form for. One entry per `@case` below. */
export const SETTINGS_FORM_GROUPS: readonly SettingsGroupId[] = ['app', 'images', 'language', 'start', 'operator', 'mail', 'privacy', 'defaults', 'platform'];
/** What `/operator/settings` offers to edit; everything else belongs to the tenant. */
export const OPERATOR_FORM_GROUPS: readonly SettingsGroupId[] = SETTINGS_FORM_GROUPS.filter((group) => group === 'platform');
/** What `/tenant/settings` offers to edit: never the platform group, not even to the operator, who has a page for it. */
export const TENANT_FORM_GROUPS: readonly SettingsGroupId[] = SETTINGS_FORM_GROUPS.filter((group) => group !== 'platform');

/**
 * Edits one group of `/tenant/settings`, or of a chosen tenant on `/operator/settings` (spec 1.174 §9.2). It writes nothing
 * itself: `onSave` (from the page) does, and the modal closes only when that answers true. After a cancelled confirmation
 * or a failed write it stays open with its values.
 */
@Component({
  selector: 'okr-settings-edit-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, ChangeConfirmation, SettingsAppForm, SettingsDefaultsForm, SettingsImagesForm, SettingsLanguageForm, SettingsMailForm, SettingsOperatorForm, SettingsPlatformForm, SettingsPrivacyForm, SettingsStartForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @switch (group()) {
        @case ('app') {
          <okr-settings-app-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
        @case ('images') {
          <okr-settings-images-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [onUpload]="onUpload()" [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
        @case ('language') {
          <okr-settings-language-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
        @case ('start') {
          <okr-settings-start-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [startOptions]="startOptions()()" [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
        @case ('operator') {
          <okr-settings-operator-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
        @case ('mail') {
          <okr-settings-mail-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
        @case ('defaults') {
          <okr-settings-defaults-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [onPickLocation]="onPickLocation()" [onPickResource]="onPickResource()" [nameOf]="nameOf()"
            [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
        @case ('platform') {
          <okr-settings-platform-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [integrationOptions]="integrationOptions()" [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
        @case ('privacy') {
          <okr-settings-privacy-form [formData]="formData()" (formDataChange)="formData.set($event)"
            [i18n]="i18n()" [context]="context()" [pageOptions]="pageOptions()()" [readOnly]="isSaving()" [showForm]="showForm()"
            (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" (busy)="formBusy.set($event)" />
        }
      }
    </ion-content>
  `,
})
export class SettingsEditModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly group = input.required<SettingsGroupId>();
  public readonly i18n = input.required<SettingsI18n>();
  /** the values of the group when the modal opened (a copy; never changed here) */
  public readonly before = input.required<TenantSettings>();
  /** which app is edited, when it is not this one: shown in the title */
  public readonly subject = input('');
  public readonly emailDomain = input('');
  public readonly appDomain = input('');
  /** A signal, because the list of pages may arrive after the modal has opened. */
  public readonly pageOptions = input<Signal<SettingsPageOption[]>>(signal<SettingsPageOption[]>([]));
  /** A signal for the same reason: menus, pages and their translated labels. */
  public readonly startOptions = input<Signal<SettingsPageOption[]>>(signal<SettingsPageOption[]>([]));
  /** Picks and uploads an image for a field of the images group; answers its storage path, undefined when cancelled or failed. */
  public readonly onUpload = input<(field: string) => Promise<string | undefined>>(() => Promise.resolve(undefined));
  /** Open the location and the resource picker of the defaults group; answer the pick, undefined when cancelled. */
  public readonly onPickLocation = input<() => Promise<SettingsChoice | undefined>>(() => Promise.resolve(undefined));
  public readonly onPickResource = input<() => Promise<SettingsChoice | undefined>>(() => Promise.resolve(undefined));
  /** The name of a stored location or resource id, '' when unknown. */
  public readonly nameOf = input<(field: string, id: string) => string>(() => '');
  /** The services the platform group can switch on. */
  public readonly integrationOptions = input<readonly IntegrationOption[]>([]);
  /** Saves the values; true closes the modal. */
  public readonly onSave = input.required<(after: TenantSettings) => Promise<boolean>>();

  protected readonly formData = linkedSignal<TenantSettings>(() => safeStructuredClone(this.before()) ?? {});
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  /** a form is busy (an upload): saving or cancelling now would leave its result out */
  protected readonly formBusy = signal(false);
  protected readonly showForm = signal(true);
  protected readonly isSaving = signal(false);

  protected readonly title = computed(() => {
    const name = this.i18n()[settingsGroupKey(this.group())]?.() ?? '';
    return this.subject() ? `${name}: ${this.subject()}` : name;
  });
  protected readonly context = computed((): SettingsContext => ({
    before: this.before(), emailDomain: this.emailDomain(), appDomain: this.appDomain(),
  }));
  /** a value typed and taken back is no change: there would be nothing to save */
  private readonly hasChanges = computed(() => Object.keys(settingsDiff(this.before(), this.formData())).length > 0);
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty() && this.hasChanges() && !this.formBusy());
  protected readonly changeConfirmationI18n = computed((): ChangeConfirmationI18n => ({
    cancel: this.i18n()['cancel'](), save: this.i18n()['save'](),
  }));

  /** The close icon may have removed the modal while a write was running; dismissing then would hit another overlay. */
  private isDestroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.isDestroyed = true; });
  }

  public async save(): Promise<void> {
    if (this.isSaving() || this.formBusy()) return;
    this.isSaving.set(true);
    const after = safeStructuredClone(this.formData()) ?? {};
    try {
      if (await this.onSave()(after) && !this.isDestroyed) await dismissOverlay(this.modalController, after, 'confirm');
    } finally {
      this.isSaving.set(false);
    }
  }

  public cancel(): void {
    if (this.isSaving() || this.formBusy()) return;
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.before()) ?? {});
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}

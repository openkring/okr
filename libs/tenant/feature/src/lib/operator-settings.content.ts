import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonItem, IonLabel, IonNote, ModalController } from '@ionic/angular';

import { of } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';

import { INTEGRATION_SWITCHES } from '@okr/security-processing-util';
import { AppConfigService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { Spinner, StringSelect } from '@okr/shared-ui';
import type { StringSelectI18n } from '@okr/shared-ui';
import { getCountryName } from '@okr/shared-util-core';
import { SettingsCards, SettingsEditModal } from '@okr/tenant-ui';
import { OPERATOR_FORM_GROUPS, SETTINGS_I18N_KEYS, settingsCards, settingsOf, takenAppDomains, tenantChoices } from '@okr/tenant-util';
import type { SettingsDisplayContext, SettingsGroupId, TenantSettings } from '@okr/tenant-util';

import { TenantSettingsStore } from './tenant-settings.store';

/**
 * The cards of `/operator/settings`: all settings of a chosen tenant, of which the operator edits the platform group. The
 * values come from the live list, so they are the new ones after a save. Names behind the keys of another tenant (pages,
 * locations, organisations) cannot be read: the key is shown.
 */
@Component({
  selector: 'okr-operator-settings-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SettingsCards, Spinner, StringSelect, IonCard, IonCardContent, IonItem, IonLabel, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (!store.isOperator()) {
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">{{ text('operator_page_refused') }}</ion-label>
      </ion-item>
    } @else if (configs() === undefined) {
      <okr-spinner />
    } @else if (choices().length === 0) {
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">{{ text('operator_page_none') }}</ion-label>
      </ion-item>
    } @else {
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-item lines="none">
            <ion-note class="ion-text-wrap">{{ text('operator_page_intro') }}</ion-note>
          </ion-item>
          <!-- a new list is a new select: ion-select does not notice a changed option text -->
          @for (version of [listVersion()]; track version) {
            <okr-string-select [i18n]="selectI18n()" [selectedString]="tenantId()" (selectedStringChange)="tenantId.set($event)"
              [stringList]="tenantIds()" [labels]="tenantLabels()" [readOnly]="false" />
          }
        </ion-card-content>
      </ion-card>
      @if (chosen()) {
        <okr-settings-cards [cards]="cards()" [i18n]="i18n" (edit)="onEdit($event)" />
      } @else {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ text('operator_page_choose') }}</ion-label>
        </ion-item>
      }
    }
  `,
})
export class OperatorSettingsContent {
  protected readonly store = inject(TenantSettingsStore);
  private readonly appConfigService = inject(AppConfigService);
  private readonly i18nService = inject(I18nService);
  private readonly modalController = inject(ModalController);

  protected readonly i18n = this.i18nService.translateAll(SETTINGS_I18N_KEYS);

  /** Every tenant's document, live; undefined until the list has answered. Nothing is read for anybody but the operator. */
  protected readonly configs = toSignal(toObservable(this.store.isOperator).pipe(
    switchMap((isOperator) => (isOperator ? this.appConfigService.list().pipe(startWith(undefined)) : of(undefined))),
  ));

  protected readonly choices = computed(() => tenantChoices(this.configs() ?? [], this.text('operator_page_archived')));
  protected readonly tenantIds = computed(() => this.choices().map((choice) => choice.id));
  protected readonly tenantLabels = computed(() => this.choices().map((choice) => choice.label));
  /** changes when the list or one of its labels does, not when another tenant is chosen */
  protected readonly listVersion = computed(() => JSON.stringify(this.choices()));

  /** The chosen tenant, '' while none is chosen. */
  protected readonly tenantId = signal('');
  protected readonly chosen = computed(() => {
    const id = this.tenantId();
    return id ? (this.configs() ?? []).find((config) => config.okey === id) : undefined;
  });

  protected readonly selectI18n = computed((): StringSelectI18n => ({
    name: 'tenant', label: this.text('operator_page_tenant'), helper: '',
  }));

  private readonly display = computed((): SettingsDisplayContext => ({
    text: (name) => this.text(name),
    countryName: (code) => getCountryName(code, this.i18nService.getActiveLang()), // not a signal: read on every call, after a language switch
    pageName: () => '',
    locationName: () => '',
    resourceName: () => '',
    startName: () => '',
    orgName: () => '',
  }));

  protected readonly cards = computed(() => {
    const config = this.chosen();
    return config ? settingsCards((group) => settingsOf(config, group), this.display(), (group) => this.canEdit(group), () => '') : [];
  });

  /** One editor at a time: a double tap must not open two. */
  private isOpening = false;

  protected text(name: string): string {
    return this.i18n[name]?.() ?? '';
  }

  private canEdit(group: SettingsGroupId): boolean {
    return this.store.isOperator() && OPERATOR_FORM_GROUPS.includes(group);
  }

  protected async onEdit(group: SettingsGroupId): Promise<void> {
    const config = this.chosen();
    if (this.isOpening || !config || !this.canEdit(group)) return;
    this.isOpening = true;
    try {
      // snapshots of this moment: a later value of the stream, or another choice, never reaches the open form
      const tenantId = config.okey;
      const before = settingsOf(config, group);
      const platform = settingsOf(config, 'platform');
      const modal = await this.modalController.create({
        component: SettingsEditModal,
        componentProps: {
          group,
          i18n: this.i18n,
          subject: tenantId,
          before: structuredClone(before),
          emailDomain: platform.emailDomain ?? '',
          appDomain: platform.appDomain ?? '',
          takenAppDomains: takenAppDomains(this.configs() ?? [], tenantId),
          integrationOptions: INTEGRATION_SWITCHES,
          onSave: (after: TenantSettings) => this.save(group, before, after, tenantId),
        },
      });
      await modal.present();
    } finally {
      this.isOpening = false;
    }
  }

  /** `store.save` answers false without throwing for a cancelled confirmation and a failed write; anything thrown counts as not saved. */
  private async save(group: SettingsGroupId, before: TenantSettings, after: TenantSettings, tenantId: string): Promise<boolean> {
    try {
      return await this.store.save(group, before, after, tenantId);
    } catch (error) {
      console.warn('OperatorSettingsContent.save: the settings could not be saved', error);
      return false;
    }
  }
}

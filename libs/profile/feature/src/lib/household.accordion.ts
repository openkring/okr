import { Component, Injector, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AlertController, IonAccordion, IonButton, IonItem, IonLabel, IonNote, ToastController } from '@ionic/angular';

import { HouseholdService } from '@okr/relationship-household-data-access';
import { HOUSEHOLD_I18N_KEYS, householdErrorKey } from '@okr/relationship-household-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { HouseholdModel, HouseholdTypeCategoryName } from '@okr/shared-models';
import { ProfileI18n } from '@okr/profile-util';
import { confirm, showToast } from '@okr/shared-util-angular';
import { getFullName, getItemLabel, readBundle, removeHouseholdMember } from '@okr/shared-util-core';

/** Whether the saved household still shows in «Mein Haushalt»: the person is a member and it was not dissolved. */
function stillMyHousehold(h: HouseholdModel, personKey: string): boolean {
  return h.memberKeys.includes(personKey) && h.memberKeys.length >= 2;
}

/**
 * «Mein Haushalt» (spec 1.168 §7/§8): shown in the profile only while the member belongs to a household. The member
 * may change name, payer, contact and bundle (the edit modal in member mode) or leave the household. A household that
 * drops below two persons is dissolved by the server.
 *
 * The edit modal lives in the household feature lib and is loaded on demand (`await import()`), so the profile chunk
 * does not pull the household feature, its modal and its form into the eager bundle.
 */
@Component({
  selector: 'okr-household-accordion',
  standalone: true,
  imports: [IonAccordion, IonItem, IonLabel, IonNote, IonButton],
  template: `
  @if (household(); as h) {
    <ion-accordion toggle-icon-slot="start" value="household">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ title() }}</ion-label>
      </ion-item>
      <div slot="content">
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            <h3>{{ h.name }}</h3>
            <p>{{ i18n().household_members() }}: {{ memberNames() }}</p>
            <p>{{ i18n().household_payer() }}: {{ payerName() }}</p>
            <p>{{ i18n().household_contact() }}: {{ contactName() }}</p>
            <p>{{ i18n().household_bundle() }}: {{ bundleSummary() }}</p>
          </ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-button fill="outline" [disabled]="busy()" (click)="edit()">{{ i18n().household_edit() }}</ion-button>
          <ion-button slot="end" fill="outline" color="danger" [disabled]="busy()" (click)="leave()">{{ i18n().household_leave() }}</ion-button>
        </ion-item>
        <ion-item lines="none">
          <ion-note class="ion-text-wrap">{{ i18n().household_leave_hint() }}</ion-note>
        </ion-item>
      </div>
    </ion-accordion>
  }
  `,
})
export class HouseholdAccordion {
  private readonly appStore = inject(AppStore);
  private readonly householdService = inject(HouseholdService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly injector = inject(Injector);
  private readonly i18nService = inject(I18nService);

  public readonly i18n = input.required<ProfileI18n>();
  public readonly color = input('primary');

  protected readonly household = signal<HouseholdModel | undefined>(undefined);
  protected readonly busy = signal(false);
  private readonly typeLabel = signal('');

  private readonly personKey = computed(() => this.appStore.currentUser()?.personKey ?? '');

  /** The tenant's label of the household type; «Mein Haushalt» without one. */
  protected readonly title = computed(() => this.typeLabel() || this.i18n().household_title());

  protected readonly memberNames = computed(() =>
    (this.household()?.memberKeys ?? []).map((k) => this.nameOf(k)).join(', '));
  protected readonly payerName = computed(() => {
    const key = this.household()?.payerKey;
    return key ? this.nameOf(key) : this.i18n().household_payer_none();
  });
  protected readonly contactName = computed(() => {
    const key = this.household()?.contactKey;
    return key ? this.nameOf(key) : this.i18n().household_payer_none();
  });
  protected readonly bundleSummary = computed(() => {
    const h = this.household();
    if (!h) return '';
    const b = readBundle(h);
    const parts = [
      b.post ? this.i18n().household_bundle_post() : '',
      b.email ? this.i18n().household_bundle_email() : '',
      b.inApp ? this.i18n().household_bundle_inApp() : '',
    ].filter((p) => p !== '');
    return parts.length > 0 ? parts.join(', ') : this.i18n().household_bundle_none();
  });

  constructor() {
    effect(() => {
      const personKey = this.personKey();
      this.appStore.tenantId();
      if (personKey) void this.load();
    });
    effect(() => {
      const type = this.household()?.type;
      if (!type) {
        untracked(() => this.typeLabel.set(''));
        return;
      }
      const category = this.appStore.getCategory(HouseholdTypeCategoryName);
      void this.i18nService.translateOnce(getItemLabel(category, type)).then((label) => this.typeLabel.set(label));
    });
  }

  private nameOf(personKey: string): string {
    const p = this.appStore.getPerson(personKey);
    return p ? getFullName(p.firstName, p.lastName) : this.i18n().household_member_unknown();
  }

  private async load(): Promise<void> {
    try {
      const { HouseholdStore } = await import('@okr/relationship-household-feature');
      this.household.set(await this.injector.get(HouseholdStore).findForPerson(this.personKey(), 'member'));
    } catch (error) {
      console.error('HouseholdAccordion.load:', error);
      this.household.set(undefined);
    }
  }

  /******************************* actions *************************************** */

  protected async edit(): Promise<void> {
    this.busy.set(true);
    try {
      const { HouseholdStore } = await import('@okr/relationship-household-feature');
      // the saved household as returned by the save, not re-read: the cached query stream may still hold the old one
      const saved = await this.injector.get(HouseholdStore).edit(this.personKey(), 'member');
      if (saved) this.household.set(stillMyHousehold(saved, this.personKey()) ? saved : undefined);
    } finally {
      this.busy.set(false);
    }
  }

  protected async leave(): Promise<void> {
    const h = this.household();
    if (!h || this.busy()) return;
    const i18n = this.i18n();
    if (!await confirm(this.alertController, i18n.household_leave_message(), i18n.household_leave(), i18n.cancel(), true)) return;
    this.busy.set(true);
    try {
      await this.householdService.save(this.appStore.tenantId(), removeHouseholdMember(h, this.personKey()));
      this.household.set(undefined);
      await showToast(this.toastController, HOUSEHOLD_I18N_KEYS.save_conf);
    } catch (error) {
      console.error('HouseholdAccordion.leave:', error);
      await showToast(this.toastController, HOUSEHOLD_I18N_KEYS[householdErrorKey(error)]);
    } finally {
      this.busy.set(false);
    }
  }
}

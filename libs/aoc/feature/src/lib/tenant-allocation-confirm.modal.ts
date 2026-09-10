import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonItem, IonLabel, IonNote, IonRadio, IonRadioGroup, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { AllocationAddressGroups, AllocationAddressItem, AllocationEmailOption, eligibleLoginEmails, resolveLoginEmail } from '@okr/aoc-util';

/** What the admin picked. Consumed by `AocTenantAllocationStore.allocate()`. */
export interface AllocationConfirmResult {
  readonly addressKeys: string[];
  readonly includeAvatar: boolean;
  readonly includeSubject: boolean;
  /** Open a user account for the person in the target tenant. */
  readonly createAccount: boolean;
  /** The address that account logs in with — empty unless `createAccount`. */
  readonly loginEmail: string;
}

export interface AllocationConfirmI18n {
  readonly title: string;
  readonly blockAlways: string;
  readonly blockAlwaysHint: string;
  readonly blockContact: string;
  readonly blockSensitive: string;
  readonly blockAvatar: string;
  readonly favoriteMarker: string;
  readonly legalNote: string;
  readonly ok: string;
  readonly cancel: string;
  readonly accountTitle: string;
  readonly accountCheckbox: string;
  readonly accountHint: string;
  readonly accountEmailChoice: string;
}

/**
 * The consent dialog of a tenant allocation (spec 1.47 §2).
 *
 * Standard modal structure: header + change-confirmation + content. No bespoke buttons.
 * On a grant every checkbox starts OFF (sharing is the deliberate act); on a revoke every
 * checkbox starts ON (taking it all back is the normal case) and the person row becomes
 * selectable, because leaving the person while dropping the data is a legitimate partial
 * revoke.
 */
@Component({
  selector: 'okr-tenant-allocation-confirm-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonLabel, IonCheckbox, IonNote,
    IonRadioGroup, IonRadio,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    <ion-content class="ion-no-padding">
      @if (!isTopUp()) {
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().blockAlways }}</ion-card-title></ion-card-header>
          <ion-card-content>
            @if (isRevoke()) {
              <ion-item lines="none">
                <ion-checkbox [checked]="includeSubject()" (ionChange)="includeSubject.set($event.detail.checked)">
                  {{ personLabel() }}
                </ion-checkbox>
              </ion-item>
            } @else {
              <ion-item lines="none"><ion-label>{{ personLabel() }}</ion-label></ion-item>
            }
            <ion-item lines="none"><ion-note>{{ i18n().blockAlwaysHint }}</ion-note></ion-item>
          </ion-card-content>
        </ion-card>
      }

      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n().blockContact }}</ion-card-title></ion-card-header>
        <ion-card-content>
          @for (item of groups().contact; track item.okey) {
            <ion-item lines="none">
              <ion-checkbox [checked]="isChecked(item.okey)" (ionChange)="toggle(item.okey, $event.detail.checked)">
                {{ label(item) }}
              </ion-checkbox>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-note>—</ion-note></ion-item>
          }
        </ion-card-content>
      </ion-card>

      <ion-card class="sensitive">
        <ion-card-header><ion-card-title>{{ i18n().blockSensitive }}</ion-card-title></ion-card-header>
        <ion-card-content>
          @for (item of groups().sensitive; track item.okey) {
            <ion-item lines="none">
              <ion-checkbox [checked]="isChecked(item.okey)" (ionChange)="toggle(item.okey, $event.detail.checked)">
                {{ label(item) }}
              </ion-checkbox>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-note>—</ion-note></ion-item>
          }
        </ion-card-content>
      </ion-card>

      @if (hasAvatar()) {
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().blockAvatar }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-checkbox [checked]="includeAvatar()" (ionChange)="includeAvatar.set($event.detail.checked)">
                {{ i18n().blockAvatar }}
              </ion-checkbox>
            </ion-item>
          </ion-card-content>
        </ion-card>
      }

      @if (canCreateAccount()) {
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().accountTitle }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-checkbox [checked]="createAccount()" (ionChange)="createAccount.set($event.detail.checked)">
                {{ i18n().accountCheckbox }}
              </ion-checkbox>
            </ion-item>
            <ion-item lines="none"><ion-note>{{ i18n().accountHint }}</ion-note></ion-item>

            @if (createAccount() && eligibleEmails().length > 1) {
              <ion-item lines="none"><ion-label>{{ i18n().accountEmailChoice }}</ion-label></ion-item>
              <ion-radio-group [value]="loginEmail()" (ionChange)="chosenEmail.set($event.detail.value)">
                @for (option of eligibleEmails(); track option.okey) {
                  <ion-item lines="none">
                    <ion-radio [value]="option.email">{{ emailLabel(option) }}</ion-radio>
                  </ion-item>
                }
              </ion-radio-group>
            }
          </ion-card-content>
        </ion-card>
      }

      <ion-card>
        <ion-card-content><ion-note>{{ i18n().legalNote }}</ion-note></ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    ion-card.sensitive { border: 1px solid var(--ion-color-warning); }
    @media (width <= 600px) { ion-card { margin: 5px; } }
  `],
})
export class TenantAllocationConfirmModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public i18n = input.required<AllocationConfirmI18n>();
  public groups = input.required<AllocationAddressGroups>();
  public personLabel = input('');
  public hasAvatar = input(false);
  public isRevoke = input(false);
  /** A grant aimed at a tenant the person ALREADY has — only the gap is listed, and block 1
   * is dropped: the person document is not travelling, it is already there. */
  public isTopUp = input(false);
  /** Addresses the target tenant already carries. Not offered as checkboxes (there is nothing
   * to transfer), but still valid login candidates on a top-up — see `eligibleEmails`. */
  public carriedAddressKeys = input<string[]>([]);
  /** The person's email addresses, each flagged with whether an account already uses it.
   * Empty on a revoke — there is nothing to open there. */
  public emailOptions = input<AllocationEmailOption[]>([]);

  // state — a revoke preselects everything, a grant preselects nothing
  protected selected = linkedSignal<Set<string>>(() => {
    if (!this.isRevoke()) return new Set<string>();
    const g = this.groups();
    return new Set<string>([...g.contact, ...g.sensitive].map(i => i.okey));
  });
  protected includeAvatar = linkedSignal(() => this.isRevoke() && this.hasAvatar());
  protected includeSubject = linkedSignal(() => true);
  /** Off by default: opening a login for another tenant is a deliberate act, like sharing. */
  protected createAccount = linkedSignal(() => false);
  protected chosenEmail = linkedSignal(() => '');

  /** Recomputed as the admin ticks addresses: an account can only log in with an address the
   * target tenant actually receives, so unticking the last free email withdraws the offer. */
  protected readonly eligibleEmails = computed(() =>
    this.isRevoke() ? [] : eligibleLoginEmails([...this.selected(), ...this.carriedAddressKeys()], this.emailOptions()));

  protected readonly canCreateAccount = computed(() => this.eligibleEmails().length > 0);

  /** The pick, corrected whenever it stopped being eligible. */
  protected readonly loginEmail = computed(() => resolveLoginEmail(this.chosenEmail(), this.eligibleEmails()));

  protected readonly changeConfirmationI18n = computed(() =>
    ({ cancel: this.i18n().cancel, save: this.i18n().ok }) as ChangeConfirmationI18n);

  protected isChecked(okey: string): boolean {
    return this.selected().has(okey);
  }

  protected toggle(okey: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(okey); else next.delete(okey);
    this.selected.set(next);
  }

  protected emailLabel(option: AllocationEmailOption): string {
    return option.isFavorite ? `${option.email} · ${this.i18n().favoriteMarker}` : option.email;
  }

  protected label(item: AllocationAddressItem): string {
    const fav = item.isFavorite ? ` · ${this.i18n().favoriteMarker}` : '';
    return `${item.channel}: ${item.value}${fav}`;
  }

  public async save(): Promise<void> {
    const createAccount = this.canCreateAccount() && this.createAccount();
    const addressKeys = [...this.selected()];
    // The callable resolves `loginEmail` only from an address named in `addressKeys`
    // (allocate-tenant.ts). On a top-up the chosen login may be an address the target already
    // carries — name it anyway: the plan builder skips it as a no-op write, and without it the
    // account request would come back as 'notSelected'.
    if (createAccount) {
      const chosen = this.eligibleEmails().find(o => o.email === this.loginEmail());
      if (chosen && !addressKeys.includes(chosen.okey)) addressKeys.push(chosen.okey);
    }
    const result: AllocationConfirmResult = {
      addressKeys,
      includeAvatar: this.includeAvatar(),
      includeSubject: this.includeSubject(),
      createAccount,
      loginEmail: createAccount ? this.loginEmail() : '',
    };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}

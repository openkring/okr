import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonItem, IonLabel, IonNote, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { AllocationAddressGroups, AllocationAddressItem } from '@okr/aoc-util';

/** What the admin picked. Consumed by `AocTenantAllocationStore.allocate()`. */
export interface AllocationConfirmResult {
  readonly addressKeys: string[];
  readonly includeAvatar: boolean;
  readonly includeSubject: boolean;
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
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonLabel, IonCheckbox, IonNote
  ],
  template: `
    <okr-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    <ion-content class="ion-no-padding">
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

  // state — a revoke preselects everything, a grant preselects nothing
  protected selected = linkedSignal<Set<string>>(() => {
    if (!this.isRevoke()) return new Set<string>();
    const g = this.groups();
    return new Set<string>([...g.contact, ...g.sensitive].map(i => i.okey));
  });
  protected includeAvatar = linkedSignal(() => this.isRevoke() && this.hasAvatar());
  protected includeSubject = linkedSignal(() => true);

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

  protected label(item: AllocationAddressItem): string {
    const fav = item.isFavorite ? ` · ${this.i18n().favoriteMarker}` : '';
    return `${item.channel}: ${item.value}${fav}`;
  }

  public async save(): Promise<void> {
    const result: AllocationConfirmResult = {
      addressKeys: [...this.selected()],
      includeAvatar: this.includeAvatar(),
      includeSubject: this.includeSubject(),
    };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}

import { Component, computed, inject, input } from '@angular/core';
import {
  ActionSheetController, IonCol, IonContent, IonGrid, IonHeader, IonLabel, IonMenuButton, IonRow,
  IonButtons, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ProspectModel } from '@okr/shared-models';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { ProspectStore } from './prospect.store';

/**
 * The prospect pool (C5), bkaiser-side in tenant `kring`.
 *
 * Read-only apart from one action, and deliberately so. A lead enters through the public signup
 * (`submitProspect`), a partner claims and releases it through the partner-facing callables, and
 * it converts only when a metering push from the claiming partner names the tenant (C5 §7 —
 * observed, never self-declared). The single thing that happens *here* is a consent revocation,
 * which is the one event that reaches bkaiser and nobody else.
 *
 * There is no "expire" button and no sweep behind this screen either: a claim is over when its
 * date has passed, so `isInPool` treats a lapsed claim as open and the header count says so
 * before any job has run.
 *
 * The contact details are **not** on this screen. They live in `addresses` under
 * `parentKey = 'prospect.<okey>'` and are released to the partner who claims the lead — that
 * release is the third-party transfer the signup notice announced. Nothing about running the pool
 * needs bkaiser to read a lead's e-mail from a list view.
 */
@Component({
  selector: 'okr-prospect-list',
  standalone: true,
  imports: [
    Spinner, ListFilter, EmptyList,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton,
    IonContent, IonGrid, IonRow, IonCol, IonLabel,
  ],
  providers: [ProspectStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.poolCount() }}/{{ prospectsCount() }} {{ store.i18n.plural() }}</ion-title>
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />

      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="5" size-md="4"><ion-label><strong>{{ store.i18n.header_name() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.header_segment() }}</strong></ion-label></ion-col>
            <ion-col size="3" size-md="2"><ion-label><strong>{{ store.i18n.header_status() }}</strong></ion-label></ion-col>
            <ion-col size="4" size-md="2"><ion-label><strong>{{ store.i18n.header_partner() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.header_expires() }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if(store.isLoading()) {
        <okr-spinner />
      } @else if(filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for(prospect of store.filteredProspects(); track prospect.okey) {
            <ion-row (click)="showActions(prospect)">
              <ion-col size="5" size-md="4">
                <ion-label>{{ prospect.name }}<br /><small>{{ prospect.source }}</small></ion-label>
              </ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label>{{ prospect.segment }}</ion-label></ion-col>
              <ion-col size="3" size-md="2">
                <ion-label [color]="statusColor(prospect)">{{ store.statusLabel(prospect.status) }}</ion-label>
              </ion-col>
              <ion-col size="4" size-md="2"><ion-label>{{ store.partnerName(prospect.claimedByPartnerKey) }}</ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label>{{ expires(prospect) }}</ion-label></ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `,
})
export class ProspectList {
  protected readonly store = inject(ProspectStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs — the route declares no `:contextMenuName`: the screen has exactly one action, and a
  // context menu would mean a menu document in Firestore per tenant for a single entry.
  public readonly listId = input('all');

  protected readonly filteredCount = computed(() => this.store.filteredProspects().length);
  protected readonly prospectsCount = computed(() => this.store.prospects().length);
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /** `withdrawn` is grey, not red: a revocation is the person exercising a right, not a failure. */
  protected statusColor(prospect: ProspectModel): string {
    switch (prospect.status) {
      case 'converted': return 'success';
      case 'claimed':   return 'primary';
      case 'withdrawn': return 'medium';
      default:          return 'dark';
    }
  }

  protected expires(prospect: ProspectModel): string {
    const at = prospect.claimExpiresAt;
    return at.length >= 8 ? `${at.slice(6, 8)}.${at.slice(4, 6)}.${at.slice(0, 4)}` : '';
  }

  protected async showActions(prospect: ProspectModel): Promise<void> {
    // Already revoked, or not an admin → nothing this screen offers.
    if (this.readOnly() || prospect.status === 'withdrawn') return;

    const options = createActionSheetOptions(this.store.i18n.as_title());
    options.buttons.push(createActionSheetButton('prospect.revoke', this.store.i18n.as_revoke(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'prospect.revoke': await this.store.revoke(prospect); break;
      case 'cancel': break;
      default: this.alertService.error(`ProspectList.showActions: unknown action ${data.action}`);
    }
  }
}

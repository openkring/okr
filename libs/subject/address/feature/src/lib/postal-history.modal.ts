import { Component, computed, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AddressCollection, AddressModel } from '@okr/shared-models';
import { PrettyDatePipe } from '@okr/shared-pipes';
import { EmptyList, Header } from '@okr/shared-ui';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { ADDRESSES_I18N_KEYS, AddressesI18n, FormatAddressPipe, postalHistoryStatus, sortPostalHistory } from '@okr/subject-address-util';

/**
 * «Alle Adressen» (spec 1.164 §6.6): every postal row of a person or org, past and archived ones
 * included, for privileged users. Read-only: no input, nothing to save, so it has no change-confirmation
 * (check-forms rule 4 does not flag it: no input, no form; no MODAL_ALLOWLIST entry is needed). Reads the raw vault, which the rules open
 * to privileged. «Erfasst von» is not shown: a row records no author, and the move notice tasks name
 * the parent, not the row.
 */
@Component({
  selector: 'okr-postal-history-modal',
  standalone: true,
  imports: [FormatAddressPipe, PrettyDatePipe, EmptyList, Header, IonContent, IonList, IonItem, IonLabel, IonNote],
  template: `
    <okr-header [i18n]="{ title: i18n.history_title() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if (rows().length === 0 && !isLoading()) {
        <okr-empty-list [message]="i18n.history_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (row of rows(); track row.okey) {
            <ion-item>
              <ion-label class="ion-text-wrap">
                <h3>{{ row | formatAddress }}</h3>
                @if (row.addressValue2) {
                  <p>{{ row.addressValue2 }}</p>
                }
                <p>
                  {{ statusLabel(row) }}
                  @if (row.validFrom) { — {{ i18n.move_from() }} {{ row.validFrom | prettyDate }} }
                  @if (row.validTo) { {{ i18n.move_until() }} {{ row.validTo | prettyDate }} }
                </p>
                @if (row.notes) {
                  <p class="notes">{{ row.notes }}</p>
                }
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
  styles: [`.notes { white-space: pre-line; }`],
})
export class PostalHistoryModal {
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(ADDRESSES_I18N_KEYS) as AddressesI18n;

  /** `person.<key>` / `org.<key>` */
  public readonly parentKey = input.required<string>();

  // The same query as the list's «archived too» (tenant + parent, no isArchived clause): known to be served
  // by the existing indexes. The channel is filtered here.
  private readonly resource = rxResource({
    params: () => ({ parentKey: this.parentKey(), tenantId: this.appStore.tenantId() }),
    stream: ({ params }) => !params.parentKey || !params.tenantId ? of([] as AddressModel[]) :
      this.appStore.firestoreService.searchData<AddressModel>(AddressCollection, [
        { key: 'tenants', operator: 'array-contains', value: params.tenantId },
        { key: 'parentKey', operator: '==', value: params.parentKey },
      ], 'none', 'asc'),
  });
  protected readonly isLoading = computed(() => this.resource.isLoading());
  protected readonly rows = computed(() => sortPostalHistory(this.resource.value() ?? []));

  protected statusLabel(row: AddressModel): string {
    switch (postalHistoryStatus(row, getTodayStr(DateFormat.StoreDate))) {
      case 'archived': return this.i18n.history_status_archived();
      case 'future': return this.i18n.history_status_future();
      case 'past': return this.i18n.history_status_past();
      default: return this.i18n.history_status_current();
    }
  }
}

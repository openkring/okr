import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { StringSelectI18n } from '@bk2/shared-ui';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonInput, IonItem, IonLabel, IonRow, IonSpinner, IonCardSubtitle } from '@ionic/angular/standalone';


import { SvgIconPipe } from '@bk2/shared-pipes';
import { Header, StringSelect } from '@bk2/shared-ui';
import { AvatarLabel } from '@bk2/avatar-ui';
import { ColorIonic } from '@bk2/shared-models';
import { DateFormat, getFullName, getTodayStr, isAfterDate } from '@bk2/shared-util-core';

export const CONTACT_FILTERS = ['Alle', 'Nur Personen', 'Nur Mitglieder', 'Nur Orgs', 'Nur Abweichungen'];

import { AocBexioStore, BexioIndex } from './aoc-bexio.store';

@Component({
  selector: 'bk-aoc-bexio',
  standalone: true,
  imports: [
    SvgIconPipe,
    Header, AvatarLabel, StringSelect,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonButton, IonIcon, IonSpinner, IonInput,
    IonCardSubtitle
],
  providers: [AocBexioStore],
  styles: [`
    /* Bexio-only contacts (no BK record, hence no avatar): flag the label column danger */
    .bexio-only { background-color: var(--ion-color-danger); }
    .bexio-only ion-item { --background: transparent; --color: var(--ion-color-danger-contrast); }
  `],
  template: `
    <bk-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.bexio_invoices_title() }}</ion-card-title>
          <ion-card-subtitle>{{ store.i18n.bexio_invoices_subtitle() }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(invoiceCount() < 0) {
                  {{ store.i18n.loading() }}
                } @else if(invoiceCount() === 0) {
                  {{ store.i18n.bexio_invoices_nodata() }}
                } @else {
                  {{ invoiceCount() }} {{ store.i18n.bexio_invoices_status() }} {{ lastSyncedAt() || 'unknown' }}.
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="syncInvoices()" [disabled]="isSyncing() || invoiceCount() > 0">
                  @if(isSyncing()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  {{ store.i18n.bexio_invoices_history() }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-input
                    label="Ab Datum"
                    labelPlacement="floating"
                    placeholder="JJJJ-MM-TT"
                    [value]="invoiceFromDate()"
                    (ionInput)="invoiceFromDate.set($any($event.detail.value))"
                  />
                </ion-item>
              </ion-col>
              <ion-col size="3" class="ion-align-self-center">
                <ion-button (click)="updateInvoices()" [disabled]="isSyncing() || !invoiceFromDate()">
                  @if(isSyncing()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  Aktualisieren
                </ion-button>
              </ion-col>
            </ion-row>
            @if(invoiceSyncResult()) {
              <ion-row>
                <ion-col>
                  <ion-item lines="none">
                    <ion-label color="success">{{ invoiceSyncResult() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.bexio_bills_title() }}</ion-card-title>
          <ion-card-subtitle>{{ store.i18n.bexio_bills_subtitle() }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(billCount() < 0) {
                  {{ store.i18n.loading() }}
                } @else if(billCount() === 0) {
                  {{ store.i18n.bexio_bills_nodata() }}                } @else {
                  {{ billCount() }} {{ store.i18n.bexio_bills_status() }} {{ lastBillSyncedAt() || 'unknown' }}.
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="syncBills()" [disabled]="isSyncingBills() || billCount() > 0">
                  @if(isSyncingBills()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  {{ store.i18n.bexio_bills_history() }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-input
                    label="Ab Datum"
                    labelPlacement="floating"
                    placeholder="JJJJ-MM-TT"
                    [value]="billFromDate()"
                    (ionInput)="billFromDate.set($any($event.detail.value))"
                  />
                </ion-item>
              </ion-col>
              <ion-col size="3" class="ion-align-self-center">
                <ion-button (click)="updateBills()" [disabled]="isSyncingBills() || !billFromDate()">
                  @if(isSyncingBills()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  Aktualisieren
                </ion-button>
              </ion-col>
            </ion-row>
            @if(billSyncResult()) {
              <ion-row>
                <ion-col>
                  <ion-item lines="none">
                    <ion-label color="success">{{ billSyncResult() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.bexio_journal_title() }}</ion-card-title>
          <ion-card-subtitle>{{ store.i18n.bexio_journal_subtitle() }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(journalCount() < 0) {
                  {{ store.i18n.loading() }}
                } @else if(journalCount() === 0) {
                  {{ store.i18n.bexio_journal_nodata() }}
                } @else {
                  {{ journalCount() }} {{ store.i18n.bexio_journal_status() }} {{ lastJournalSyncedAt() || 'unknown' }}.
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="syncJournal()" [disabled]="isSyncingJournal()">
                  @if(isSyncingJournal()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  {{ store.i18n.bexio_journal_history() }}
                </ion-button>
              </ion-col>
            </ion-row>
            @if(journalSyncResult()) {
              <ion-row>
                <ion-col>
                  <ion-item lines="none">
                    <ion-label color="success">{{ journalSyncResult() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.bexio_accounts_title() }}</ion-card-title>
          <ion-card-subtitle>{{ store.i18n.bexio_accounts_subtitle() }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(accountSyncResult()) {
                  {{ accountSyncResult() }}
                } @else {
                  {{ store.i18n.bexio_accounts_download() }}
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="syncAccounts()" [disabled]="isSyncingAccounts()">
                  @if(isSyncingAccounts()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  {{ store.i18n.bexio_accounts_history() }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-input
                    label="Root-Name"
                    labelPlacement="floating"
                    placeholder="z.B. bexio"
                    [value]="clearRootName()"
                    (ionInput)="clearRootName.set($any($event.detail.value))"
                  />
                </ion-item>
              </ion-col>
              <ion-col size="3" class="ion-align-self-center">
                <ion-button color="danger" (click)="clearAccountTree()" [disabled]="isClearingAccounts() || !clearRootName()">
                  @if(isClearingAccounts()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'trash' | svgIcon }}" slot="start" />
                  }
                  Clear tree
                </ion-button>
              </ion-col>
              @if(clearAccountResult()) {
                <ion-col size="3" class="ion-align-self-center">
                  <ion-label>{{ clearAccountResult() }}</ion-label>
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.bexio_index_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">{{ store.i18n.bexio_index_content() }}</ion-col>
              <ion-col size="3">
                <ion-button (click)="buildIndex()" [disabled]="isLoading()">
                  @if(isLoading()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  {{ store.i18n.bexio_index_button() }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <bk-string-select [i18n]="contactFilterI18n()" [selectedString]="contactFilter()" (selectedStringChange)="contactFilter.set($event)" [stringList]="contactFilters" [readOnly]="false" />
              </ion-col>
            </ion-row>
            @if(filteredIndex().length > 0) {
              <ion-row>
                <ion-item lines="none">
                  <small>{{ filteredIndex().length }}</small>
                </ion-item>
              </ion-row>
              <ion-row>
                <ion-col size="5"><strong>Name</strong></ion-col>
                <ion-col size="1"><strong>Kat</strong></ion-col>
                <ion-col size="3"><strong>BK Bexio ID</strong></ion-col>
                <ion-col size="3"><strong>Bexio ID</strong></ion-col>
              </ion-row>
              @for(item of filteredIndex(); track item.key + '_' + item.bkey + '_' + item.bx_id) {
                <ion-row style="cursor: pointer" (click)="edit(item)">
                  <ion-col size="5" [class.bexio-only]="!item.bkey">
                    @if(item.bkey) {
                      <bk-avatar-label
                        [key]="avatarKey(item)"
                        [label]="displayName(item)"
                        [color]="avatarColor(item)"
                        [alt]="displayName(item)"
                      />
                    } @else {
                      <ion-item lines="none">
                        <ion-label>{{ displayName(item) }}</ion-label>
                      </ion-item>
                    }
                  </ion-col>
                  <ion-col size="1">
                    <ion-item lines="none">
                      <ion-label>{{ item.mcat }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bexioId || '' }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bx_id || '' }}</ion-label>
                    </ion-item>
                  </ion-col>
                </ion-row>
              }
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.bexio_vendor_title() }}</ion-card-title>
          <ion-card-subtitle>{{ store.i18n.bexio_vendor_subtitle() }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(vendorPendingCount() < 0) {
                  {{ store.i18n.bexio_vendor_status_initial() }}
                } @else if(vendorPendingCount() === 0) {
                  {{ store.i18n.bexio_vendor_status_done() }}
                } @else {
                  {{ vendorPendingCount() }} {{ store.i18n.bexio_vendor_status_open() }}
                }
                @if(vendorLinkedCount() >= 0) {
                  {{ vendorLinkedCount() }} {{ store.i18n.bexio_vendor_status_linked() }}
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="linkVendors()" [disabled]="isLinkingVendors() || billCount() <= 0">
                  @if(isLinkingVendors()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'link' | svgIcon }}" slot="start" />
                  }
                  Verknüpfen
                </ion-button>
              </ion-col>
            </ion-row>
            @if(vendorUnmatched().length > 0) {
              <ion-row>
                <ion-col>
                  <ion-item lines="none">
                    <ion-label color="warning">{{ store.i18n.bexio_vendor_status_unmatched() }}</ion-label>
                  </ion-item>
                  @for(name of vendorUnmatched(); track name) {
                    <ion-item lines="none">
                      <ion-label color="medium">{{ name }}</ion-label>
                    </ion-item>
                  }
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.bexio_receiver_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(receiverPendingCount() < 0) {
                  {{ store.i18n.bexio_receiver_status_initial() }}
                } @else if(receiverPendingCount() === 0) {
                  {{ store.i18n.bexio_receiver_status_done() }}
                } @else {
                  {{ receiverPendingCount() }} {{ store.i18n.bexio_receiver_status_open() }}
                }
                @if(receiverLinkCount() >= 0) {
                  {{ receiverLinkCount() }} {{ store.i18n.bexio_receiver_status_linked() }}
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="linkReceivers()" [disabled]="isLinking() || invoiceCount() <= 0">
                  @if(isLinking()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'link' | svgIcon }}" slot="start" />
                  }
                  {{ store.i18n.bexio_receiver_link() }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocBexio implements OnInit {
  protected readonly store = inject(AocBexioStore);

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly index = computed(() => this.store.index());

  protected readonly invoiceCount = computed(() => this.store.invoiceCount());
  protected readonly lastSyncedAt = computed(() => this.store.lastSyncedAt());
  protected readonly receiverPendingCount = computed(() => this.store.receiverPendingCount());
  protected readonly receiverLinkCount = computed(() => this.store.receiverLinkCount());
  protected readonly billCount = computed(() => this.store.billCount());
  protected readonly lastBillSyncedAt = computed(() => this.store.lastBillSyncedAt());
  protected readonly vendorPendingCount = computed(() => this.store.vendorPendingCount());
  protected readonly vendorLinkedCount = computed(() => this.store.vendorLinkedCount());
  protected readonly vendorUnmatched = computed(() => this.store.vendorUnmatched());
  protected readonly journalCount = computed(() => this.store.journalCount());
  protected readonly lastJournalSyncedAt = computed(() => this.store.lastJournalSyncedAt());

  protected isLinking = signal(false);
  protected isLinkingVendors = signal(false);

  protected isSyncing = signal(false);
  protected invoiceSyncResult = signal('');
  protected invoiceFromDate = signal('');
  protected isSyncingBills = signal(false);
  protected billSyncResult = signal('');
  protected billFromDate = signal('');
  protected isSyncingJournal = signal(false);
  protected journalSyncResult = signal('');
  protected isSyncingAccounts = signal(false);
  protected accountSyncResult = signal('');
  protected isClearingAccounts = signal(false);
  protected clearAccountResult = signal('');
  protected clearRootName = signal('');

  public ngOnInit(): void {
    this.store.loadInvoiceStats();
    this.store.loadBillStats();
    this.store.loadJournalStats();
  }

  protected readonly contactFilters = CONTACT_FILTERS;
  protected contactFilter = signal(CONTACT_FILTERS[0]);
  protected readonly contactFilterI18n = computed(() => ({
    name: 'bexioContactFilter',
    label: this.store.i18n.bexio_index_contactFilter_label(),
  } as StringSelectI18n));
  protected readonly filteredIndex = computed(() => {
    const today = getTodayStr(DateFormat.StoreDate);
    switch (this.contactFilter()) {
      case 'Nur Personen':    return this.index().filter(i => i.type === 'person');
      case 'Nur Mitglieder':  return this.index().filter(i => isAfterDate(i.dateOfExit, today));
      case 'Nur Orgs':        return this.index().filter(i => i.type === 'org');
      case 'Nur Abweichungen': return this.index().filter(i => !this.store.compareAddressData(i));
      default:                return this.index();
    }
  });

  protected avatarKey(item: BexioIndex): string {
    return `${item.type}.${item.bkey}`;
  }

  protected displayName(item: BexioIndex): string {
    if (item.bkey) return getFullName(item.name1, item.name2) || item.name1;
    return getFullName(item.bx_name1, item.bx_name2) || item.bx_name1;
  }

  protected async syncInvoices(): Promise<void> {
    this.isSyncing.set(true);
    this.invoiceSyncResult.set('');
    try {
      const result = await this.store.syncInvoices();
      this.invoiceSyncResult.set(`Downloaded ${result.count} invoices.`);
      await this.store.loadInvoiceStats();
    } finally {
      this.isSyncing.set(false);
    }
  }

  protected async syncBills(): Promise<void> {
    this.isSyncingBills.set(true);
    this.billSyncResult.set('');
    try {
      const result = await this.store.syncBills();
      this.billSyncResult.set(`Downloaded ${result.count} bills.`);
      await this.store.loadBillStats();
    } finally {
      this.isSyncingBills.set(false);
    }
  }

  /** Incremental re-sync of invoices from a chosen date (enabled even when invoices already exist). */
  protected async updateInvoices(): Promise<void> {
    this.isSyncing.set(true);
    this.invoiceSyncResult.set('');
    try {
      const result = await this.store.syncInvoices(this.normalizeFromDate(this.invoiceFromDate()));
      this.invoiceSyncResult.set(`Downloaded ${result.count} invoices.`);
      await this.store.loadInvoiceStats();
    } finally {
      this.isSyncing.set(false);
    }
  }

  /** Incremental re-sync of bills from a chosen date (enabled even when bills already exist). */
  protected async updateBills(): Promise<void> {
    this.isSyncingBills.set(true);
    this.billSyncResult.set('');
    try {
      const result = await this.store.syncBills(this.normalizeFromDate(this.billFromDate()));
      this.billSyncResult.set(`Downloaded ${result.count} bills.`);
      await this.store.loadBillStats();
    } finally {
      this.isSyncingBills.set(false);
    }
  }

  /** Accept "YYYY-MM-DD" (append midnight) or a full "YYYY-MM-DD HH:mm:ss" as Bexio expects. */
  private normalizeFromDate(input: string): string {
    const trimmed = input.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed} 00:00:00` : trimmed;
  }

  protected async syncJournal(): Promise<void> {
    this.isSyncingJournal.set(true);
    this.journalSyncResult.set('');
    try {
      const result = await this.store.syncJournal();
      this.journalSyncResult.set(`Downloaded ${result.count} journal entries.`);
      await this.store.loadJournalStats();
    } finally {
      this.isSyncingJournal.set(false);
    }
  }

  protected async linkVendors(): Promise<void> {
    this.isLinkingVendors.set(true);
    try {
      await this.store.linkBillVendors();
    } finally {
      this.isLinkingVendors.set(false);
    }
  }

  protected async linkReceivers(): Promise<void> {
    this.isLinking.set(true);
    try {
      await this.store.linkInvoiceReceivers();
    } finally {
      this.isLinking.set(false);
    }
  }

  protected async syncAccounts(): Promise<void> {
    this.isSyncingAccounts.set(true);
    this.accountSyncResult.set('');
    try {
      const result = await this.store.syncAccounts();
      this.accountSyncResult.set(`Downloaded ${result.groups} groups and ${result.accounts} accounts.`);
    } finally {
      this.isSyncingAccounts.set(false);
    }
  }

  protected async clearAccountTree(): Promise<void> {
    this.isClearingAccounts.set(true);
    this.clearAccountResult.set('');
    try {
      const count = await this.store.clearAccountTree(this.clearRootName());
      this.clearAccountResult.set(count > 0 ? `Deleted ${count} documents.` : 'Root not found.');
    } finally {
      this.isClearingAccounts.set(false);
    }
  }

  protected async buildIndex(): Promise<void> {
    await this.store.buildIndex();
  }

  protected avatarColor(item: BexioIndex): ColorIonic {
    return this.store.compareAddressData(item) ? ColorIonic.Success : ColorIonic.Danger;
  }

  protected async edit(item: BexioIndex): Promise<void> {
    await this.store.edit(item);
  }
}

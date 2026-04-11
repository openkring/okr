import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonRow, IonSpinner, IonCardSubtitle } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { HeaderComponent } from '@bk2/shared-ui';
import { AvatarLabelComponent } from '@bk2/avatar-ui';
import { ColorIonic } from '@bk2/shared-models';
import { DateFormat, getFullName, getTodayStr, isAfterDate } from '@bk2/shared-util-core';

import { AocBexioStore, BexioIndex } from './aoc-bexio.store';

@Component({
  selector: 'bk-aoc-bexio',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    HeaderComponent, AvatarLabelComponent,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonButton, IonIcon, IonSpinner, IonCheckbox,
    IonCardSubtitle
],
  providers: [AocBexioStore],
  template: `
    <bk-header title="@aoc.bexio.title" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Invoices</ion-card-title>
          <ion-card-subtitle>Diese Funktion ist für den initialen Download von Debitoren aus Bexio gedacht. Nachdem dieser initiale Sync einmal gemacht ist, werden die zukünftigen Rechnungen täglich am frühen Morgen hinzugefügt.</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(invoiceCount() < 0) {
                  Loading...
                } @else if(invoiceCount() === 0) {
                  No invoices yet. Download the full history from Bexio.
                } @else {
                  {{ invoiceCount() }} invoices in Firestore. Last sync: {{ lastSyncedAt() || 'unknown' }}.
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="syncInvoices()" [disabled]="isSyncing() || invoiceCount() > 0">
                  @if(isSyncing()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  Full history
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
          <ion-card-title>Bills</ion-card-title>
          <ion-card-subtitle>Diese Funktion ist für den initialen Download von Kreditoren aus Bexio gedacht. Nachdem dieser initiale Sync einmal gemacht ist, werden die zukünftigen Rechnungen täglich am frühen Morgen hinzugefügt.</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(billCount() < 0) {
                  Loading...
                } @else if(billCount() === 0) {
                  No bills yet. Download the full history from Bexio.
                } @else {
                  {{ billCount() }} bills in Firestore. Last sync: {{ lastBillSyncedAt() || 'unknown' }}.
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="syncBills()" [disabled]="isSyncingBills() || billCount() > 0">
                  @if(isSyncingBills()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  Full history
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
          <ion-card-title>{{ '@aoc.bexio.index.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">{{ '@aoc.bexio.index.content' | translate | async }}</ion-col>
              <ion-col size="3">
                <ion-button (click)="buildIndex()" [disabled]="isLoading()">
                  @if(isLoading()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                  }
                  {{ '@aoc.bexio.index.button' | translate | async }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-checkbox labelPlacement="end" [checked]="showOnlyCurrentMembers()" (ionChange)="showOnlyCurrentMembers.set($event.detail.checked)">Show only current members</ion-checkbox>
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
                <ion-col size="3"><strong>BK Bexio ID</strong></ion-col>
                <ion-col size="3"><strong>Bexio ID</strong></ion-col>
              </ion-row>
              @for(item of filteredIndex(); track item.key + '_' + item.bkey + '_' + item.bx_id) {
                <ion-row>
                  <ion-col size="5">
                    @if(item.bkey) {
                      <bk-avatar-label
                        [key]="avatarKey(item)"
                        [label]="displayName(item)"
                        [color]="color"
                        [alt]="displayName(item)"
                      />
                    } @else {
                      <ion-item lines="none">
                        <ion-label color="medium">{{ displayName(item) }}</ion-label>
                      </ion-item>
                    }
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bexioId || '' }}</ion-label>
                      @if(!item.bexioId && item.bx_id) {
                        <ion-button slot="end" fill="clear" (click)="addToBk(item)">
                          <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
                        </ion-button>
                      }
                    </ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">
                      <ion-label>{{ item.bx_id || '' }}</ion-label>
                      @if(item.bexioId && !item.bx_id) {
                        <ion-button slot="end" fill="clear" (click)="addToBexio(item)">
                          <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
                        </ion-button>
                      }
                    </ion-item>
                  </ion-col>
                  <ion-col size="1">
                    <ion-item lines="none">
                      <ion-button slot="end" fill="clear" (click)="edit(item)">
                        <ion-icon src="{{ 'address' | svgIcon }}" slot="icon-only" [color]="addressColor(item)" />
                      </ion-button>
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
          <ion-card-title>Vendor Sync</ion-card-title>
          <ion-card-subtitle>Verknüpft die Lieferanten der Bills mit Personen oder Orgs anhand des Namens.</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(vendorPendingCount() < 0) {
                  Noch nicht geprüft.
                } @else if(vendorPendingCount() === 0) {
                  Alle Bills haben einen Vendor.
                } @else {
                  {{ vendorPendingCount() }} Bills ohne Vendor.
                }
                @if(vendorLinkedCount() >= 0) {
                  {{ vendorLinkedCount() }} Vendors verknüpft.
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
                    <ion-label color="warning">Keine Übereinstimmung gefunden für:</ion-label>
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
          <ion-card-title>Rechnungs-Empfänger</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(receiverPendingCount() < 0) {
                  Noch nicht geprüft.
                } @else if(receiverPendingCount() === 0) {
                  Alle Rechnungen haben einen Empfänger.
                } @else {
                  {{ receiverPendingCount() }} Rechnungen ohne Empfänger.
                }
                @if(receiverLinkCount() >= 0) {
                  {{ receiverLinkCount() }} Empfänger verknüpft.
                }
              </ion-col>
              <ion-col size="3">
                <ion-button (click)="linkReceivers()" [disabled]="isLinking() || invoiceCount() <= 0">
                  @if(isLinking()) {
                    <ion-spinner name="crescent" slot="start" />
                  } @else {
                    <ion-icon src="{{ 'link' | svgIcon }}" slot="start" />
                  }
                  Verknüpfen
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
  protected readonly color = ColorIonic.Light;

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

  protected isLinking = signal(false);
  protected isLinkingVendors = signal(false);

  protected isSyncing = signal(false);
  protected invoiceSyncResult = signal('');
  protected isSyncingBills = signal(false);
  protected billSyncResult = signal('');

  public ngOnInit(): void {
    this.store.loadInvoiceStats();
    this.store.loadBillStats();
  }

  protected showOnlyCurrentMembers = signal(false);
  protected readonly filteredIndex = computed(() => {
    const today = getTodayStr(DateFormat.StoreDate);
    if (this.showOnlyCurrentMembers()) {
      return this.index().filter(i => {
        if (!i.dateOfExit || i.dateOfExit.length !== 8) return false;
        return isAfterDate(i.dateOfExit, today);
      })
    } else {
      return this.index();
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

  protected async buildIndex(): Promise<void> {
    await this.store.buildIndex();
  }

  protected async addToBexio(item: BexioIndex): Promise<void> {
    await this.store.addToBexio(item);
  }

  protected async addToBk(item: BexioIndex): Promise<void> {
    await this.store.addToBk(item);
  }

  protected addressColor(item: BexioIndex): string {
    return this.store.compareAddressData(item) ? 'success' : 'danger';
  }

  protected async edit(item: BexioIndex): Promise<void> {
    console.log(item);
    await this.store.edit(item);
  }
}
